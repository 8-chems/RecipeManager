const { Pool } = require('pg');
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

let config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
};

// Check if we are running in GCP or connecting via Cloud SQL unix socket
if (process.env.DB_HOST && process.env.DB_HOST.startsWith('/cloudsql/')) {
  config.host = process.env.DB_HOST;
} else {
  config.host = process.env.DB_HOST || '127.0.0.1';
  config.port = process.env.DB_PORT || 5432;
}

// Add SSL configurations for Cloud SQL if we are connecting over public IP in production securely,
// but for simpler dev / test setups, plain connection is standard.
// If using Cloud SQL Proxy locally or internal Unix Socket on Cloud Run, SSL is handled.
const pool = new Pool(config);

/**
 * Initializes the database schema (creates tables if they don't exist)
 */
async function initializeDatabase() {
  const client = await pool.connect();
  try {
    console.log('Initializing database tables...');
    await client.query('BEGIN');
    
    // Create recipes table
    await client.query(`
      CREATE TABLE IF NOT EXISTS recipes (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        instructions TEXT NOT NULL,
        prep_time INT NOT NULL DEFAULT 0,
        cook_time INT NOT NULL DEFAULT 0,
        servings INT NOT NULL DEFAULT 1,
        image_url TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create ingredients table
    await client.query(`
      CREATE TABLE IF NOT EXISTS recipe_ingredients (
        id SERIAL PRIMARY KEY,
        recipe_id INT REFERENCES recipes(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        amount VARCHAR(100),
        unit VARCHAR(50)
      )
    `);

    await client.query('COMMIT');
    console.log('Database tables successfully verified/created.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to initialize database tables:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Gets all recipes, merging them with their ingredients
 */
async function getAllRecipes() {
  const query = `
    SELECT r.*, 
           COALESCE(
             json_agg(
               json_build_object(
                 'id', i.id,
                 'name', i.name,
                 'amount', i.amount,
                 'unit', i.unit
               )
             ) FILTER (WHERE i.id IS NOT NULL), 
             '[]'
           ) as ingredients
    FROM recipes r
    LEFT JOIN recipe_ingredients i ON r.id = i.recipe_id
    GROUP BY r.id
    ORDER BY r.created_at DESC
  `;
  const res = await pool.query(query);
  return res.rows;
}

/**
 * Gets a specific recipe by ID
 */
async function getRecipeById(id) {
  const query = `
    SELECT r.*, 
           COALESCE(
             json_agg(
               json_build_object(
                 'id', i.id,
                 'name', i.name,
                 'amount', i.amount,
                 'unit', i.unit
               )
             ) FILTER (WHERE i.id IS NOT NULL), 
             '[]'
           ) as ingredients
    FROM recipes r
    LEFT JOIN recipe_ingredients i ON r.id = i.recipe_id
    WHERE r.id = $1
    GROUP BY r.id
  `;
  const res = await pool.query(query, [id]);
  return res.rows[0] || null;
}

/**
 * Insets a new recipe with its ingredients
 */
async function createRecipe(recipeData) {
  const { title, description, instructions, prep_time, cook_time, servings, image_url, ingredients } = recipeData;
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Insert recipe metadata
    const recipeQuery = `
      INSERT INTO recipes (title, description, instructions, prep_time, cook_time, servings, image_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const recipeRes = await client.query(recipeQuery, [
      title,
      description,
      instructions,
      prep_time || 0,
      cook_time || 0,
      servings || 1,
      image_url
    ]);
    const createdRecipe = recipeRes.rows[0];

    // Insert recipe ingredients if provided
    let insertedIngredients = [];
    if (ingredients && ingredients.length > 0) {
      const ingredientQuery = `
        INSERT INTO recipe_ingredients (recipe_id, name, amount, unit)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `;
      for (const ing of ingredients) {
        const ingRes = await client.query(ingredientQuery, [
          createdRecipe.id,
          ing.name,
          ing.amount || '',
          ing.unit || ''
        ]);
        insertedIngredients.push(ingRes.rows[0]);
      }
    }

    await client.query('COMMIT');
    return {
      ...createdRecipe,
      ingredients: insertedIngredients
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in createRecipe transaction:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Deletes a recipe
 */
async function deleteRecipe(id) {
  const query = 'DELETE FROM recipes WHERE id = $1 RETURNING *';
  const res = await pool.query(query, [id]);
  return res.rows[0] || null;
}

module.exports = {
  pool,
  initializeDatabase,
  getAllRecipes,
  getRecipeById,
  createRecipe,
  deleteRecipe
};
