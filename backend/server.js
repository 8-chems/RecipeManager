const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { 
  initializeDatabase, 
  getAllRecipes, 
  getRecipeById, 
  createRecipe, 
  deleteRecipe,
  pool 
} = require('./db');
const { uploadImage, checkBucketConnectivity } = require('./storage');
const { 
  initializeBigQuery, 
  logRecipeEvent, 
  getTopViewedRecipes, 
  getEventsBreakdown, 
  checkBigQueryHealth 
} = require('./bigquery');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Configure multer for memory storage file upload handling
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // limit of 5MB
  },
});

// Bootstrapping function
async function bootstrap() {
  console.log('--- Bootstrapping Recipe Manager backend ---');
  try {
    // 1. Initialize PostgreSQL Database connection and schema
    await initializeDatabase();
  } catch (error) {
    console.error('CRITICAL: Failed to initialize DB. It might not be reachable yet.', error.message);
  }

  try {
    // 2. Initialize BigQuery dataset and audit table setup
    await initializeBigQuery();
  } catch (error) {
    console.error('CRITICAL: Failed to initialize BigQuery.', error.message);
  }
}

// Routes
// 1. Diagnostics/Health check endpoint verifying connection to GCP services
app.get('/api/health', async (req, res) => {
  const healthStats = {
    timestamp: new Date().toISOString(),
    status: 'UNKNOWN',
    postgres: { status: 'Checking', message: '' },
    gcs: { status: 'Checking', message: '' },
    bigquery: { status: 'Checking', message: '' }
  };

  try {
    // SQL check
    await pool.query('SELECT 1');
    healthStats.postgres = { status: 'OK', message: 'SQL Database connection functional' };
  } catch (error) {
    healthStats.postgres = { status: 'FAIL', message: error.message };
  }

  // Storage check
  healthStats.gcs = await checkBucketConnectivity();

  // BigQuery check
  healthStats.bigquery = await checkBigQueryHealth();

  // Determine overall status
  const services = [healthStats.postgres.status, healthStats.gcs.status, healthStats.bigquery.status];
  if (services.includes('FAIL') || services.includes('Error')) {
    healthStats.status = 'DEGRADED';
  } else if (services.includes('Unconfigured')) {
    healthStats.status = 'PARTIAL_LOCAL';
  } else {
    healthStats.status = 'HEALTHY';
  }

  res.json(healthStats);
});

// 2. Fetch all recipes
app.get('/api/recipes', async (req, res) => {
  try {
    const list = await getAllRecipes();
    res.json(list);
  } catch (error) {
    console.error('GET /api/recipes error:', error);
    res.status(500).json({ error: 'Failed to retrieve recipes from SQL database.' });
  }
});

// 3. Fetch specific recipe by ID
app.get('/api/recipes/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const recipe = await getRecipeById(id);
    if (!recipe) {
      return res.status(404).json({ error: `Recipe ID ${id} not found.` });
    }

    // Capture analytic/view log in background via BigQuery
    logRecipeEvent('view', id, recipe.title, {
      userAgent: req.headers['user-agent'],
      ip: req.ip || req.connection.remoteAddress
    });

    res.json(recipe);
  } catch (error) {
    console.error(`GET /api/recipes/${id} error:`, error);
    res.status(500).json({ error: 'Failed to retrieve recipe details.' });
  }
});

// 4. Create new recipe with image upload to GCS and PG tracking
app.post('/api/recipes', upload.single('image'), async (req, res) => {
  try {
    const { title, description, instructions, prep_time, cook_time, servings, ingredientsJson } = req.body;

    if (!title || !instructions) {
      return res.status(400).json({ error: 'Title and instructions are required.' });
    }

    let ingredients = [];
    if (ingredientsJson) {
      try {
        ingredients = JSON.parse(ingredientsJson);
      } catch (err) {
        return res.status(400).json({ error: 'Invalid ingredients format. Must be a valid JSON array.' });
      }
    }

    // Upload image to GCS if files are provided
    let imageUrl = '';
    if (req.file) {
      try {
        imageUrl = await uploadImage(req.file.buffer, req.file.originalname, req.file.mimetype);
      } catch (uploadError) {
        console.error('Image upload failed, falling back to default:', uploadError.message);
        // We can choose to fail the request or proceed.
        // Let's print the error and let it proceed without an image or with fallback.
        imageUrl = 'https://picsum.photos/800/600?random=1'; // Fallback
      }
    } else {
      // If no file, default to a colorful placeholder
      imageUrl = `https://picsum.photos/800/600?random=${Math.floor(Math.random() * 100)}`;
    }

    const payload = {
      title,
      description,
      instructions,
      prep_time: parseInt(prep_time, 10) || 0,
      cook_time: parseInt(cook_time, 10) || 0,
      servings: parseInt(servings, 10) || 1,
      image_url: imageUrl,
      ingredients
    };

    const newRecipe = await createRecipe(payload);

    // Track creation event in BigQuery
    logRecipeEvent('create', newRecipe.id, newRecipe.title, {
      ingredientCount: ingredients.length,
      prepTime: payload.prep_time,
      cookTime: payload.cook_time
    });

    res.status(201).json(newRecipe);
  } catch (error) {
    console.error('POST /api/recipes error:', error);
    res.status(500).json({ error: 'Failed to create recipe. Check database/storage state.' });
  }
});

// 5. Delete specific recipe
app.delete('/api/recipes/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const target = await getRecipeById(id);
    if (!target) {
      return res.status(404).json({ error: `Recipe ID ${id} not found.` });
    }

    const deleted = await deleteRecipe(id);

    // Track deletion event in BigQuery
    logRecipeEvent('delete', id, target.title);

    res.json({ message: 'Recipe successfully deleted', deletedRecipe: deleted });
  } catch (error) {
    console.error(`DELETE /api/recipes/${id} error:`, error);
    res.status(500).json({ error: 'Failed to delete recipe.' });
  }
});

// 6. Analytics endpoints: Top-viewed recipes from BigQuery
app.get('/api/analytics/top-viewed', async (req, res) => {
  try {
    const stats = await getTopViewedRecipes();
    res.json(stats);
  } catch (error) {
    console.error('GET /api/analytics/top-viewed error:', error);
    res.status(500).json({ error: 'Failed to query BigQuery analytical data.' });
  }
});

// 7. Analytics endpoints: Event type breakdown from BigQuery
app.get('/api/analytics/events-breakdown', async (req, res) => {
  try {
    const stats = await getEventsBreakdown();
    res.json(stats);
  } catch (error) {
    console.error('GET /api/analytics/events-breakdown error:', error);
    res.status(500).json({ error: 'Failed to query BigQuery audit telemetry.' });
  }
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Run bootstrap processes then start Listening
bootstrap().then(() => {
  app.listen(PORT, () => {
    console.log(`Server successfully listening on port ${PORT}`);
  });
}).catch(err => {
  console.error('Express bootstrapping failed:', err.message);
  // Still serve API even if connection failed so user can query health endpoints
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT} (Status: DEGRADED)`);
  });
});
