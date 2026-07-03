const { Pool } = require('pg');
const { initializeDatabase, createRecipe } = require('../backend/db');
const { uploadImage } = require('../backend/storage');
const { logRecipeEvent } = require('../backend/bigquery');
require('dotenv').config({ path: '../backend/.env' });

// Sample Recipe Dataset with high-quality descriptions, categories, ingredients, and Unsplash URLs
const SAMPLE_RECIPES = [
  {
    title: "Classic Margherita Pizza",
    description: "A simple yet delicious Italian classic featuring a thin, crispy crust topped with rich tomato sauce, fresh mozzarella cheese, aromatic basil leaves, and a drizzle of extra virgin olive oil.",
    prep_time: 20,
    cook_time: 12,
    servings: 2,
    sourceUrl: "https://images.unsplash.com/photo-1604068549290-dea0e4a305ca?q=80&w=800",
    ingredients: [
      { name: "Pizza Dough", amount: "1", unit: "ball" },
      { name: "San Marzano Tomatoes (Crushed)", amount: "1/2", unit: "cup" },
      { name: "Fresh Mozzarella Cheese", amount: "150", unit: "g" },
      { name: "Fresh Basil Leaves", amount: "6", unit: "pieces" },
      { name: "Extra Virgin Olive Oil", amount: "1", unit: "tbsp" },
      { name: "Sea Salt", amount: "1/2", unit: "tsp" }
    ],
    instructions: "1. Preheat your oven (and pizza stone if using) to 500°F (260°C).\n2. Roll out the pizza dough on a floured surface to about a 12-inch circle.\n3. Spread the crushed San Marzano tomatoes evenly over the dough, leaving a small border.\n4. Tear the fresh mozzarella cheese into chunks and scatter over the sauce.\n5. Bake in the hot oven for 10-12 minutes until the crust is golden brown and the cheese is bubbly.\n6. Remove from the oven, immediately top with fresh basil leaves, drizzle with olive oil, sprinkle with sea salt, slice and serve hot."
  },
  {
    title: "Sizzling Pad Thai",
    description: "A popular Thai street food dish that blends sweet, sour, and savory flavors. Stir-fried rice noodles combined with egg, sprouts, fresh herbs, peanuts, and succulent shrimp in a signature tangy tamarind sauce.",
    prep_time: 15,
    cook_time: 10,
    servings: 2,
    sourceUrl: "https://images.unsplash.com/photo-1559314809-0d155014e29e?q=80&w=800",
    ingredients: [
      { name: "Flat Rice Noodles", amount: "150", unit: "g" },
      { name: "Shrimp (peeled & deveined)", amount: "8", unit: "pieces" },
      { name: "Tamarind Paste", amount: "2", unit: "tbsp" },
      { name: "Palm Sugar", amount: "2", unit: "tbsp" },
      { name: "Fish Sauce (or Soy Sauce)", amount: "2", unit: "tbsp" },
      { name: "Eggs", amount: "2", unit: "large" },
      { name: "Firm Tofu (cubed)", amount: "50", unit: "g" },
      { name: "Bean Sprouts", amount: "1", unit: "cup" },
      { name: "Garlic Chives (chopped)", amount: "1/4", unit: "cup" },
      { name: "Roasted Peanuts (crushed)", amount: "3", unit: "tbsp" }
    ],
    instructions: "1. Soak rice noodles in warm water for 30 minutes until pliable but firm. Drain and set aside.\n2. In a small bowl, whisk tamarind paste, palm sugar, and fish sauce together. Warm slightly to dissolve the sugar.\n3. Heat 1 tbsp of oil in a wok over medium-high heat. Sear the tofu cubes and shrimp until shrimp turn pink. Remove shrimp and set aside.\n4. Push tofu to the side, crack eggs in the empty space, and scramble until set.\n5. Raise heat to high. Add noodles and tamarind sauce mix. Toss continuously for 2-3 minutes. If noodles are too dry, add a splash of water.\n6. Add back the shrimp. Fold in bean sprouts and garlic chives. Stir-fry for 1 minute.\n7. Plate immediately and garnish topped with crushed peanuts and a wedge of fresh lime."
  },
  {
    title: "Decadent Chocolate Lava Cake",
    description: "Indulget in a rich chocolate dessert with a warm, liquid centers that ready to flow. A gourmet masterpiece that is surprisingly simple to make in small ramekins, leaving a lasting impression.",
    prep_time: 10,
    cook_time: 13,
    servings: 2,
    sourceUrl: "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?q=80&w=800",
    ingredients: [
      { name: "High-Quality Dark Chocolate", amount: "100", unit: "g" },
      { name: "Unsalted Butter", amount: "50", unit: "g" },
      { name: "Eggs", amount: "1", unit: "whole" },
      { name: "Egg Yolk", amount: "1", unit: "yolk" },
      { name: "White Sugar", amount: "2", unit: "tbsp" },
      { name: "All-Purpose Flour", amount: "2", unit: "tbsp" },
      { name: "Cocoa Powder", amount: "1", unit: "tbsp" },
      { name: "Powdered Sugar", amount: "1", unit: "tbsp" }
    ],
    instructions: "1. Preheat oven to 425°F (218°C). Grease two 6-oz ramekins with butter and dust lightly with cocoa powder.\n2. Melt the dark chocolate and butter together in a heatproof bowl in short microwave bursts or over a double boiler. Stir until smooth.\n3. In a separate bowl, whisk egg, egg yolk, and white sugar vigorously for 2 minutes until pale and slightly thickened.\n4. Fold the melted chocolate mixture and flour gently into the whisked eggs until just combined.\n5. Divide batter evenly between the prepared ramekins.\n6. Bake for 12-14 minutes. The edges should represent cooked cake, but the top center will remain slightly soft.\n7. Let cool for 1 minute. Invert ramekins onto plates. Let stand for 10 seconds then raise cup. Dust with powdered sugar and serve with vanilla ice cream."
  }
];

// Helper to fetch Unsplash image buffer and upload it to GCS
async function uploadRemoteImageToGCS(url, filename) {
  try {
    const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
    console.log(`Fetching remote placeholder image from URL: ${url}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Fetch failed with status ${response.status}`);
    const buffer = await response.buffer();
    
    // Upload image buffer using GCS helper
    const mimeType = response.headers.get('content-type') || 'image/jpeg';
    const gcsUrl = await uploadImage(buffer, filename, mimeType);
    return gcsUrl;
  } catch (error) {
    console.warn(`GCS upload warning: ${error.message}. Defaulting database entry to original url.`);
    return url;
  }
}

async function seed() {
  console.log('--- Initializing GCP Sandbox Seeder script ---');
  
  // 1. First ensure SQL schema is ready
  try {
    await initializeDatabase();
  } catch (dbErr) {
    console.error('CRITICAL: Cannot connect/initialize DB. Seed aborted.', dbErr.message);
    process.exit(1);
  }

  // 2. Loop through and create recipes
  console.log('Seeding recipes...');
  for (const recipeData of SAMPLE_RECIPES) {
    console.log(`\nProcessing: "${recipeData.title}"`);
    let finalImageUrl = recipeData.sourceUrl;

    // Try GCS save
    if (process.env.GCS_BUCKET_NAME) {
      const fileName = `${recipeData.title.toLowerCase().replace(/\s+/g, '_')}.jpg`;
      finalImageUrl = await uploadRemoteImageToGCS(recipeData.sourceUrl, fileName);
    }
    
    // Save to Database
    try {
      const created = await createRecipe({
        title: recipeData.title,
        description: recipeData.description,
        instructions: recipeData.instructions,
        prep_time: recipeData.prep_time,
        cook_time: recipeData.cook_time,
        servings: recipeData.servings,
        image_url: finalImageUrl,
        ingredients: recipeData.ingredients
      });
      console.log(`Successfully created DB record ID: ${created.id}`);

      // Seed mock BigQuery views for this recipe
      if (process.env.GCP_PROJECT_ID) {
        // Stream a few dummy views to populate chart
        const randViews = Math.floor(Math.random() * 8) + 2;
        console.log(`Querying BigQuery: Logging ${randViews} preview views for "${recipeData.title}"...`);
        for (let i = 0; i < randViews; i++) {
          await logRecipeEvent('view', created.id, created.title, {
            seedViewIndex: i,
            userAgent: 'GCP-Validator-Seeder/v1',
            ip: '127.0.0.1'
          });
        }
      }
    } catch (insertErr) {
      console.error(`DB insert error for ${recipeData.title}:`, insertErr.message);
    }
  }

  console.log('\n--- Seeding procedure complete! ---');
  process.exit(0);
}

// Check node-fetch availability
try {
  require('node-fetch');
  seed();
} catch (e) {
  console.log('Installing node-fetch briefly for image download dependencies...');
  const { execSync } = require('child_process');
  execSync('npm install node-fetch@2', { cwd: '../backend' });
  seed();
}
