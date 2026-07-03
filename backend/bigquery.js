const { BigQuery } = require('@google-cloud/bigquery');
require('dotenv').config();

const projectId = process.env.GCP_PROJECT_ID;
const datasetId = process.env.BQ_DATASET_NAME || 'recipe_analytics';
const tableId = 'recipe_events';

// BigQuery configuration automatically infers credentials from Google ADC
const bq = new BigQuery({
  projectId: projectId,
});

/**
 * Initializes the BigQuery dataset and table if they don't exist
 */
async function initializeBigQuery() {
  if (!projectId) {
    console.warn('GCP_PROJECT_ID is not configured. BigQuery initialization skipped.');
    return;
  }

  try {
    console.log(`Checking BigQuery dataset: ${datasetId}...`);
    const dataset = bq.dataset(datasetId);
    const [datasetExists] = await dataset.exists();
    
    if (!datasetExists) {
      console.log(`Dataset ${datasetId} does not exist. Creating...`);
      await bq.createDataset(datasetId);
      console.log(`Dataset ${datasetId} created successfully.`);
    }

    const table = dataset.table(tableId);
    const [tableExists] = await table.exists();

    if (!tableExists) {
      console.log(`Table ${tableId} does not exist. Creating schema...`);
      const schema = [
        { name: 'event_type', type: 'STRING', mode: 'REQUIRED' },
        { name: 'recipe_id', type: 'INTEGER', mode: 'NULLABLE' },
        { name: 'recipe_title', type: 'STRING', mode: 'NULLABLE' },
        { name: 'timestamp', type: 'TIMESTAMP', mode: 'REQUIRED' },
        { name: 'details', type: 'STRING', mode: 'NULLABLE' }
      ];

      const options = {
        schema: schema,
        location: 'US', // default location
      };

      await dataset.createTable(tableId, options);
      console.log(`Table ${tableId} created successfully.`);
    } else {
      console.log(`Table ${tableId} verified.`);
    }
  } catch (error) {
    console.error('Failed to initialize BigQuery dataset/table:', error);
    // Do not crash the entire app if BigQuery fails (soft telemetry fallback)
  }
}

/**
 * Streams an audit/analytics event to BigQuery
 */
async function logRecipeEvent(eventType, recipeId, recipeTitle, details = {}) {
  try {
    if (!projectId) return;

    const row = {
      event_type: eventType,
      recipe_id: recipeId ? parseInt(recipeId, 10) : null,
      recipe_title: recipeTitle || null,
      timestamp: new Date().toISOString(),
      details: typeof details === 'object' ? JSON.stringify(details) : details
    };

    console.log(`Streaming event "${eventType}" for recipe ID ${recipeId} to BigQuery...`);
    await bq.dataset(datasetId).table(tableId).insert([row]);
    console.log('Event streamed successfully to BigQuery.');
  } catch (error) {
    // Print BQ-specific inner error details if present
    if (error.errors) {
      console.error('BigQuery insert errors:', JSON.stringify(error.errors));
    } else {
      console.error('Error logging event to BigQuery:', error.message);
    }
  }
}

/**
 * Retrieves analytics: top viewed recipes
 */
async function getTopViewedRecipes() {
  if (!projectId) {
    return [];
  }
  
  const query = `
    SELECT 
      recipe_title as title, 
      COUNT(*) as count
    FROM \`${projectId}.${datasetId}.${tableId}\`
    WHERE event_type = 'view' AND recipe_title IS NOT NULL
    GROUP BY recipe_title
    ORDER BY count DESC
    LIMIT 5
  `;

  const options = {
    query: query,
    location: 'US',
  };

  const [job] = await bq.createQueryJob(options);
  const [rows] = await job.getQueryResults();
  return rows;
}

/**
 * Retrieves analytics: total event type distributions
 */
async function getEventsBreakdown() {
  if (!projectId) {
    return [];
  }

  const query = `
    SELECT 
      event_type as action, 
      COUNT(*) as count
    FROM \`${projectId}.${datasetId}.${tableId}\`
    GROUP BY event_type
    ORDER BY count DESC
  `;

  const options = {
    query: query,
    location: 'US',
  };

  const [job] = await bq.createQueryJob(options);
  const [rows] = await job.getQueryResults();
  return rows;
}

/**
 * Checks BigQuery connection health
 */
async function checkBigQueryHealth() {
  try {
    if (!projectId) {
      return { status: 'Unconfigured', message: 'GCP_PROJECT_ID not set' };
    }
    // Run simple meta dynamic query
    const [rows] = await bq.query({ query: 'SELECT 1 as val', location: 'US' });
    if (rows && rows.length > 0 && rows[0].val === 1) {
      return { status: 'OK', message: 'Successfully queried BigQuery engine' };
    }
    return { status: 'Error', message: 'Unexpected response from BigQuery API' };
  } catch (error) {
    console.error('BigQuery health check error:', error.message);
    return { status: 'Error', message: error.message };
  }
}

module.exports = {
  initializeBigQuery,
  logRecipeEvent,
  getTopViewedRecipes,
  getEventsBreakdown,
  checkBigQueryHealth
};
