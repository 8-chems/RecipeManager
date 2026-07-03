import React, { useState, useEffect } from 'react';
import './App.css';

// API base URL strategy:
//  • Local dev  → '/api'  (Vite proxies this to localhost:5000, avoiding CORS entirely)
//  • Production → VITE_API_BASE_URL injected at build time by GitHub Actions CI/CD
const API_BASE = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL}/api`
  : '/api';

function App() {
  const [activeTab, setActiveTab] = useState('recipes'); // tabs: 'recipes', 'analytics', 'setup-info'
  const [recipes, setRecipes] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Health and Diagnostics States
  const [healthStatus, setHealthStatus] = useState(null);
  const [checkingHealth, setCheckingHealth] = useState(false);

  // BigQuery Analytics States
  const [topRecipes, setTopRecipes] = useState([]);
  const [eventsBreakdown, setEventsBreakdown] = useState([]);
  const [queryingBQ, setQueryingBQ] = useState(false);

  // Detail Modal State
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [fetchingDetailId, setFetchingDetailId] = useState(null);

  // Create Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [submittingRecipe, setSubmittingRecipe] = useState(false);
  const [recipeFormArgs, setRecipeFormArgs] = useState({
    title: '',
    description: '',
    instructions: '',
    prep_time: '',
    cook_time: '',
    servings: '',
  });
  const [formIngredients, setFormIngredients] = useState([
    { name: 'Flour', amount: '2', unit: 'cups' },
    { name: 'Sugar', amount: '1/2', unit: 'cup' }
  ]);
  const [imageFile, setImageFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);

  // Load recipes list on startup
  useEffect(() => {
    fetchRecipes();
    fetchHealthStatus();
  }, []);

  // Fetch all recipes from DB via backend API
  const fetchRecipes = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/recipes`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server responded with status ${response.status}`);
      }
      const data = await response.json();
      setRecipes(data);
    } catch (err) {
      console.error(err);
      if (err instanceof TypeError && err.message === 'Failed to fetch') {
        setError('Could not connect to backend server. Make sure server is running on port 5000.');
      } else {
        setError(err.message || 'Failed to load recipes.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Fetch Service Integration Health
  const fetchHealthStatus = async () => {
    setCheckingHealth(true);
    try {
      const response = await fetch(`${API_BASE}/health`);
      const data = await response.json();
      setHealthStatus(data);
    } catch (err) {
      console.error(err);
      setHealthStatus({
        status: 'DEGRADED',
        postgres: { status: 'FAIL', message: 'Unable to reach backend diagnostics API' },
        gcs: { status: 'FAIL', message: 'No connection' },
        bigquery: { status: 'FAIL', message: 'No connection' }
      });
    } finally {
      setCheckingHealth(false);
    }
  };

  // Run BigQuery analytics query pulls
  const fetchBigQueryAnalytics = async () => {
    setQueryingBQ(true);
    try {
      const [topRes, eventsRes] = await Promise.all([
        fetch(`${API_BASE}/analytics/top-viewed`).then(res => res.json()),
        fetch(`${API_BASE}/analytics/events-breakdown`).then(res => res.json())
      ]);
      setTopRecipes(Array.isArray(topRes) ? topRes : []);
      setEventsBreakdown(Array.isArray(eventsRes) ? eventsRes : []);
    } catch (err) {
      console.error('BigQuery fetching error:', err);
    } finally {
      setQueryingBQ(false);
    }
  };

  // Trigger loading BQ analytics when switching to analytics tab
  useEffect(() => {
    if (activeTab === 'analytics') {
      fetchBigQueryAnalytics();
    }
  }, [activeTab]);

  // Open recipe details (resolves single view logging to BigQuery)
  const handleRecipeClick = async (id) => {
    setFetchingDetailId(id);
    try {
      const response = await fetch(`${API_BASE}/recipes/${id}`);
      if (!response.ok) throw new Error('Failed to load recipe details');
      const detailedRecipe = await response.json();
      setSelectedRecipe(detailedRecipe);
    } catch (err) {
      alert(err.message);
    } finally {
      setFetchingDetailId(null);
    }
  };

  // Handle recipe deletions
  const handleDeleteRecipe = async (id) => {
    if (!confirm('Are you sure you want to delete this recipe? The action will be logged in BigQuery.')) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/recipes/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete recipe');
      
      setSelectedRecipe(null);
      fetchRecipes();
      // If we are in analytics tab, refresh
      if (activeTab === 'analytics') fetchBigQueryAnalytics();
    } catch (err) {
      alert(err.message);
    }
  };

  // File drag & drop helpers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        setImageFile(file);
      } else {
        alert('Please drop an image file (PNG/JPG)');
      }
    }
  };

  // Dynamic ingredient rows modification
  const addFormIngredient = () => {
    setFormIngredients([...formIngredients, { name: '', amount: '', unit: '' }]);
  };

  const removeFormIngredient = (index) => {
    const list = [...formIngredients];
    list.splice(index, 1);
    setFormIngredients(list);
  };

  const handleIngredientChange = (index, field, value) => {
    const list = [...formIngredients];
    list[index][field] = value;
    setFormIngredients(list);
  };

  // Submit new recipe form multipart/form-data
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!recipeFormArgs.title || !recipeFormArgs.instructions) {
      alert('Please fill out Title and Cooking Instructions');
      return;
    }

    setSubmittingRecipe(true);
    try {
      const formData = new FormData();
      formData.append('title', recipeFormArgs.title);
      formData.append('description', recipeFormArgs.description);
      formData.append('instructions', recipeFormArgs.instructions);
      formData.append('prep_time', recipeFormArgs.prep_time || '0');
      formData.append('cook_time', recipeFormArgs.cook_time || '0');
      formData.append('servings', recipeFormArgs.servings || '1');
      
      // Filter out empty ingredients and append as json string
      const cleanIngredients = formIngredients.filter(i => i.name.trim() !== '');
      formData.append('ingredientsJson', JSON.stringify(cleanIngredients));

      if (imageFile) {
        formData.append('image', imageFile);
      }

      const response = await fetch(`${API_BASE}/recipes`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to create recipe on server.');
      }

      // Reset form variables
      setRecipeFormArgs({
        title: '',
        description: '',
        instructions: '',
        prep_time: '',
        cook_time: '',
        servings: '',
      });
      setFormIngredients([{ name: '', amount: '', unit: '' }]);
      setImageFile(null);
      setShowAddModal(false);
      
      // Refresh Lists
      fetchRecipes();
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmittingRecipe(false);
    }
  };

  // Filtering recipe card list from search input query
  const filteredRecipes = recipes.filter(r => {
    const sQuery = searchQuery.toLowerCase().trim();
    if (!sQuery) return true;
    
    const inTitleDesc = r.title.toLowerCase().includes(sQuery) || 
                       (r.description && r.description.toLowerCase().includes(sQuery));
    
    const inIngredients = r.ingredients && r.ingredients.some(ing => 
      ing.name.toLowerCase().includes(sQuery)
    );

    return inTitleDesc || inIngredients;
  });

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">G</div>
          <div className="brand-name">GCP Sandbox</div>
        </div>

        <nav>
          <ul className="nav-links">
            <li className="nav-item">
              <button 
                onClick={() => setActiveTab('recipes')} 
                className={`nav-btn ${activeTab === 'recipes' ? 'active' : ''}`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                Recipe Manager
              </button>
            </li>
            <li className="nav-item">
              <button 
                onClick={() => setActiveTab('analytics')} 
                className={`nav-btn ${activeTab === 'analytics' ? 'active' : ''}`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.21 15.89A10 10 0 1 1 8 2.83M22 12A10 10 0 0 0 12 2v10z"/></svg>
                GCP Monitor
              </button>
            </li>
            <li className="nav-item">
              <button 
                onClick={() => setActiveTab('setup-info')} 
                className={`nav-btn ${activeTab === 'setup-info' ? 'active' : ''}`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                Setup Guide
              </button>
            </li>
          </ul>
        </nav>

        {/* Global Connection status inside sidebar */}
        <div className="sidebar-status-box">
          <div className="sidebar-status-title">GCP Integrations</div>
          {checkingHealth ? (
            <div className="status-indicator" style={{color: 'var(--text-secondary)'}}>
              <div className="spinner" style={{width: 12, height: 12, borderHeight: 1.5}}></div>
              Pinging...
            </div>
          ) : healthStatus ? (
            <div className="status-indicator">
              <div className={`status-dot ${
                healthStatus.status === 'HEALTHY' ? 'healthy' : 
                healthStatus.status === 'PARTIAL_LOCAL' ? 'local' : 'degraded'
              }`}></div>
              <span style={{textTransform: 'capitalize'}}>
                {healthStatus.status.toLowerCase().replace('_', ' ')}
              </span>
            </div>
          ) : (
            <div className="status-indicator">
              <div className="status-dot degraded"></div>
              <span>Disconnected</span>
            </div>
          )}
        </div>
      </aside>

      {/* Main Panel Viewport */}
      <main className="main-content">
        <header className="page-header">
          <div className="page-title">
            {activeTab === 'recipes' && (
              <>
                <h1>Cloud Recipe Vault</h1>
                <p>SQL Database retrieval, GCS Media storage engine backend</p>
              </>
            )}
            {activeTab === 'analytics' && (
              <>
                <h1>Google BigQuery Analytics</h1>
                <p>Real-time analytics trace on log stream databases</p>
              </>
            )}
            {activeTab === 'setup-info' && (
              <>
                <h1>GCP Deployment & Sandbox Guide</h1>
                <p>Deploy react frontend, node api, cloud sql, buckets & BQ tables</p>
              </>
            )}
          </div>

          <div style={{display: 'flex', gap: '1rem'}}>
            <button className="btn btn-secondary" onClick={fetchHealthStatus} disabled={checkingHealth}>
              {checkingHealth ? 'Syncing...' : 'Diagnostics Ping'}
            </button>
            {activeTab === 'recipes' && (
              <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                <span>+</span> Add Recipe
              </button>
            )}
          </div>
        </header>

        {/* Dynamic Inner views */}
        {activeTab === 'recipes' && renderRecipesView()}
        {activeTab === 'analytics' && renderAnalyticsView()}
        {activeTab === 'setup-info' && renderSetupView()}
      </main>

      {/* MODALS RENDERING */}
      {selectedRecipe && renderRecipeDetailModal()}
      {showAddModal && renderAddRecipeModal()}
    </div>
  );

  // HELPER SUB-RENDERERS

  // 1. RECIPES LIST VIEWS
  function renderRecipesView() {
    if (loading) {
      return (
        <div className="glow-loading">
          <div className="spinner"></div>
          Retrieving Recipes from Cloud SQL...
        </div>
      );
    }

    if (error) {
      return (
        <div className="empty-state" style={{borderColor: 'rgba(239, 68, 68, 0.2)'}}>
          <div className="empty-state-icon" style={{color: 'var(--accent-red)'}}>⚠️</div>
          <div className="empty-state-title">Backend Connection Refused</div>
          <div className="empty-state-desc">{error}</div>
          <button className="btn btn-primary" onClick={fetchRecipes}>Retry Connection</button>
        </div>
      );
    }

    return (
      <>
        <div className="actions-row">
          <div className="search-wrapper">
            <input 
              type="text" 
              className="search-input" 
              placeholder="Search recipes index or key ingredients name..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <span className="search-icon">🔍</span>
          </div>
        </div>

        {filteredRecipes.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🍳</div>
            <div className="empty-state-title">No Recipes Found</div>
            <div className="empty-state-desc">
              {searchQuery ? `No cooking results matching "${searchQuery}" filter.` : 'Your vault is empty. Click "+ Add Recipe" to start testing.'}
            </div>
            {searchQuery && (
              <button className="btn btn-secondary" onClick={() => setSearchQuery('')}>Clear Filter</button>
            )}
          </div>
        ) : (
          <div className="recipes-grid">
            {filteredRecipes.map((recipe) => (
              <div 
                key={recipe.id} 
                className="recipe-card"
                onClick={() => handleRecipeClick(recipe.id)}
              >
                <div className="card-img-wrapper">
                  <img src={recipe.image_url} alt={recipe.title} className="card-img" />
                  <span className="card-tag">{recipe.servings} servings</span>
                </div>
                <div className="card-content">
                  <h3 className="card-title">{recipe.title}</h3>
                  <p className="card-desc">{recipe.description || 'No description provided.'}</p>
                  
                  <div className="card-meta">
                    <div className="meta-item">
                      <span>⏱️ Add/Prep:</span>
                      <strong>{recipe.prep_time + recipe.cook_time}m</strong>
                    </div>
                    <div className="meta-item">
                      <span>🥗 Ingredients:</span>
                      <strong>{recipe.ingredients ? recipe.ingredients.length : 0}</strong>
                    </div>
                  </div>
                </div>
                
                {fetchingDetailId === recipe.id && (
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(11, 15, 25, 0.7)', display: 'flex', 
                    alignItems: 'center', justifyContent: 'center'
                  }}>
                    <div className="spinner"></div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  // 2. BIGQUERY ANALYTICS VIEW
  function renderAnalyticsView() {
    return (
      <div className="dashboard-grid">
        {/* Service Integration Status Diagnostics */}
        <div className="dash-card grid-span-full">
          <div className="dash-card-title">
            <span>Core Infrastructures Health</span>
            <button className="btn btn-secondary" style={{padding: '0.4rem 0.8rem', fontSize: '0.8rem'}} onClick={fetchHealthStatus}>
              Ping Cloud Stack
            </button>
          </div>
          
          <div className="service-status-list">
            <div className="service-status-item">
              <div className="service-info">
                <div className="service-icon sql">SQL</div>
                <div className="service-name">
                  <h4>Google Cloud SQL (PostgreSQL)</h4>
                  <p>Metadata storage & transactional consistency</p>
                </div>
              </div>
              <div>
                {healthStatus ? (
                  healthStatus.postgres.status === 'OK' ? (
                    <span className="badge badge-ok">Connected</span>
                  ) : (
                    <span className="badge badge-fail" title={healthStatus.postgres.message}>Failure</span>
                  )
                ) : (
                  <span className="badge badge-checking">Checking...</span>
                )}
              </div>
            </div>

            <div className="service-status-item">
              <div className="service-info">
                <div className="service-icon gcs">GCS</div>
                <div className="service-name">
                  <h4>Google Cloud Storage (GCS Bucket)</h4>
                  <p>Repository storing media assets and uploaded photos</p>
                </div>
              </div>
              <div>
                {healthStatus ? (
                  healthStatus.gcs.status === 'OK' ? (
                    <span className="badge badge-ok">Connected</span>
                  ) : healthStatus.gcs.status === 'Unconfigured' ? (
                    <span className="badge badge-local">Local / Dummy</span>
                  ) : (
                    <span className="badge badge-fail" title={healthStatus.gcs.message}>Failure</span>
                  )
                ) : (
                  <span className="badge badge-checking">Checking...</span>
                )}
              </div>
            </div>

            <div className="service-status-item">
              <div className="service-info">
                <div className="service-icon bq">BQ</div>
                <div className="service-name">
                  <h4>Google BigQuery Sandbox</h4>
                  <p>Audit streaming metrics logs & deep analytics aggregates</p>
                </div>
              </div>
              <div>
                {healthStatus ? (
                  healthStatus.bigquery.status === 'OK' ? (
                    <span className="badge badge-ok">Connected</span>
                  ) : healthStatus.bigquery.status === 'Unconfigured' ? (
                    <span className="badge badge-local">Local / Dummy</span>
                  ) : (
                    <span className="badge badge-fail" title={healthStatus.bigquery.message}>Failure</span>
                  )
                ) : (
                  <span className="badge badge-checking">Checking...</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* BigQuery Analytics View count */}
        <div className="dash-card">
          <div className="dash-card-title">
            <span>Query Results: Top Recipe Views</span>
            <button className="btn btn-secondary" style={{padding: '0.4rem 0.8rem', fontSize: '0.8rem'}} onClick={fetchBigQueryAnalytics} disabled={queryingBQ}>
              {queryingBQ ? 'Executing Job...' : 'Execute BQ Query'}
            </button>
          </div>

          {queryingBQ ? (
            <div className="glow-loading"><div className="spinner"></div>Running BiqQuery job...</div>
          ) : topRecipes.length === 0 ? (
            <div className="empty-state" style={{padding: '2rem'}}>
              <p className="empty-state-desc">No recipe view events logged in BigQuery dataset yet. Go read some recipe cards first!</p>
            </div>
          ) : (
            <div className="analytics-chart-container">
              {topRecipes.map((item, idx) => {
                const max = topRecipes[0] ? topRecipes[0].count : 1;
                const widthPercent = (item.count / max) * 100;
                return (
                  <div key={idx} className="chart-bar-row">
                    <div className="chart-label" title={item.title}>{item.title}</div>
                    <div className="chart-bar-bg">
                      <div className="chart-bar-fill" style={{ width: `${widthPercent}%` }}></div>
                    </div>
                    <div className="chart-value">{item.count} views</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Event Logs telemetry schema list */}
        <div className="dash-card">
          <div className="dash-card-title">
            <span>Event Streaming Statistics</span>
          </div>

          {queryingBQ ? (
            <div className="glow-loading"><div className="spinner"></div>Analysing logs...</div>
          ) : eventsBreakdown.length === 0 ? (
            <div className="empty-state" style={{padding: '2rem'}}>
              <p className="empty-state-desc">No events stream detected in table recipe_events.</p>
            </div>
          ) : (
            <div className="events-breakdown-list">
              {eventsBreakdown.map((item, idx) => (
                <div key={idx} className="event-breakdown-row">
                  <div className="event-label-wrapper">
                    <div className={`event-icon-dot ${item.action}`}></div>
                    <span className="event-name" style={{textTransform: 'uppercase'}}>{item.action} Event</span>
                  </div>
                  <span className="event-count">{item.count} counts</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 3. STEP BY STEP SETUP GUIDE
  function renderSetupView() {
    return (
      <div className="dash-card">
        <h2 style={{fontFamily: 'var(--font-header)', marginBottom: '1.25rem', color: 'var(--accent-indigo)'}}>GCP & Local Sandbox Setup Checklist</h2>
        <p style={{color: 'var(--text-secondary)', marginBottom: '2rem', lineHeight: '1.6'}}>
          This application connects a React SPA client (on GCS or Cloud Run) to an Express backend wrapper (on Cloud Run) which aggregates cloud operations on GCP PostgreSQL SQL DB, Cloud Storage media uploads, and BigQuery telemetry. Follow these instructions step-by-step.
        </p>

        <div style={{display: 'flex', flexDirection: 'column', gap: '2rem'}}>
          <div style={{borderLeft: '3px solid var(--accent-blue)', paddingLeft: '1.5rem'}}>
            <h3 style={{fontSize: '1.1rem', marginBottom: '0.5rem'}}>1. Install Terraform & Authenticate Cloud CLI</h3>
            <p style={{fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.5', marginBottom: '0.75rem'}}>
              Install Google Cloud SDK and login to credentials helper. Also, make sure targeting project context exists.
            </p>
            <pre style={{background: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.85rem', overflowX: 'auto'}}>
              {`gcloud auth login\ngcloud auth application-default login\ngcloud config set project [YOUR_PROJECT_ID]`}
            </pre>
          </div>

          <div style={{borderLeft: '3px solid var(--accent-indigo)', paddingLeft: '1.5rem'}}>
            <h3 style={{fontSize: '1.1rem', marginBottom: '0.5rem'}}>2. Spin Up Services with Terraform</h3>
            <p style={{fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.5', marginBottom: '0.75rem'}}>
              Our infrastructure is defined inside <code>/terraform</code>. Move inside directories and apply configuration. It creates high-speed SQL DBs, public access buckets, and analytical logging tables.
            </p>
            <pre style={{background: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.85rem', overflowX: 'auto'}}>
              {`cd terraform\nterraform init\nterraform apply`}
            </pre>
          </div>

          <div style={{borderLeft: '3px solid var(--accent-purple)', paddingLeft: '1.5rem'}}>
            <h3 style={{fontSize: '1.1rem', marginBottom: '0.5rem'}}>3. Setup Local Credentials and ENV variables</h3>
            <p style={{fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.5', marginBottom: '0.75rem'}}>
              Once Cloud SQL and GCS resources are mapped, duplicate <code>backend/.env.example</code> into <code>backend/.env</code> and customize fields like <code>DB_HOST</code>, <code>GCS_BUCKET_NAME</code> & <code>GCP_PROJECT_ID</code>.
            </p>
          </div>

          <div style={{borderLeft: '3px solid var(--accent-green)', paddingLeft: '1.5rem'}}>
            <h3 style={{fontSize: '1.1rem', marginBottom: '0.5rem'}}>4. Run Seed Script & Local Execution</h3>
            <p style={{fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.5', marginBottom: '0.75rem'}}>
              To run the backend API client locally matching default configurations:
            </p>
            <pre style={{background: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.85rem', overflowX: 'auto'}}>
              {`# Backend Startup\ncd backend\nnpm install\nnpm run dev\n\n# Frontend Startup (another shell tab)\ncd frontend\nnpm install\nnpm run dev`}
            </pre>
          </div>
        </div>
      </div>
    );
  }

  // 4. RECIPE DETAIL DIALOG
  function renderRecipeDetailModal() {
    const { id, title, description, instructions, prep_time, cook_time, servings, image_url, ingredients } = selectedRecipe;
    return (
      <div className="modal-overlay" onClick={() => setSelectedRecipe(null)}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <button className="modal-close-btn" onClick={() => setSelectedRecipe(null)}>✕</button>
          
          <div className="detail-banner">
            <img src={image_url} alt={title} className="detail-banner-img" />
            <div className="detail-banner-overlay"></div>
            <div className="detail-header-info">
              <h2 className="detail-title">{title}</h2>
            </div>
          </div>

          <div className="detail-body">
            <div className="detail-meta-pill-container">
              <div className="detail-pill">⏱️ Prep: {prep_time} mins</div>
              <div className="detail-pill">🔥 Cook: {cook_time} mins</div>
              <div className="detail-pill">🥗 Serves: {servings} people</div>
            </div>

            <p style={{color: 'var(--text-secondary)', fontSize: '1.05rem', lineHeight: '1.6', marginBottom: '2rem'}}>
              {description || 'No recipe details summary provided.'}
            </p>

            <div className="detail-grid">
              {/* Ingredients Box */}
              <div className="ingredients-box">
                <h3 className="section-title">Ingredients</h3>
                {(!ingredients || ingredients.length === 0) ? (
                  <p style={{color: 'var(--text-muted)'}}>No specific ingredients referenced.</p>
                ) : (
                  <ul className="ingredients-list">
                    {ingredients.map((ing, idx) => (
                      <li key={idx} className="ingredient-item">
                        <span className="ing-name">{ing.name}</span>
                        {ing.amount && (
                          <span className="ing-amount">{ing.amount} {ing.unit}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Instructions steps */}
              <div>
                <h3 className="section-title">Instructions</h3>
                <p className="instructions-text">{instructions}</p>
              </div>
            </div>

            <div className="detail-actions">
              <button className="btn btn-secondary" onClick={() => setSelectedRecipe(null)}>Back to list</button>
              <button className="btn btn-danger" onClick={() => handleDeleteRecipe(id)}>Delete Recipe</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 5. CREATE RECIPE DIALOG
  function renderAddRecipeModal() {
    return (
      <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
        <div className="modal-content" style={{padding: '2rem'}} onClick={(e) => e.stopPropagation()}>
          <button className="modal-close-btn" onClick={() => setShowAddModal(false)}>✕</button>
          
          <h2 style={{fontFamily: 'var(--font-header)', fontSize: '1.75rem', marginBottom: '1.5rem'}}>Add New Recipe</h2>
          
          <form onSubmit={handleFormSubmit}>
            <div className="form-group">
              <label className="form-label">Recipe Title *</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="e.g. Grandma's Apple Pie"
                value={recipeFormArgs.title}
                onChange={e => setRecipeFormArgs({...recipeFormArgs, title: e.target.value})}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea 
                className="form-input" 
                rows="2"
                placeholder="Brief summary introducing the recipe..."
                value={recipeFormArgs.description}
                onChange={e => setRecipeFormArgs({...recipeFormArgs, description: e.target.value})}
              />
            </div>

            <div className="form-row-3 form-group">
              <div>
                <label className="form-label">Prep Time (mins)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={recipeFormArgs.prep_time}
                  onChange={e => setRecipeFormArgs({...recipeFormArgs, prep_time: e.target.value})}
                  min="0"
                />
              </div>
              <div>
                <label className="form-label">Cook Time (mins)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={recipeFormArgs.cook_time}
                  onChange={e => setRecipeFormArgs({...recipeFormArgs, cook_time: e.target.value})}
                  min="0"
                />
              </div>
              <div>
                <label className="form-label">Servings</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={recipeFormArgs.servings}
                  onChange={e => setRecipeFormArgs({...recipeFormArgs, servings: e.target.value})}
                  min="1"
                />
              </div>
            </div>

            {/* Ingredients builder */}
            <div className="form-group">
              <label className="form-label">Ingredients Checklist</label>
              <div className="ingredient-builder">
                {formIngredients.map((ing, idx) => (
                  <div key={idx} className="ingredient-input-row">
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="Ingredient Name"
                      value={ing.name}
                      onChange={e => handleIngredientChange(idx, 'name', e.target.value)}
                    />
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="Amount"
                      value={ing.amount}
                      onChange={e => handleIngredientChange(idx, 'amount', e.target.value)}
                    />
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="Unit (e.g. g, cup)"
                      value={ing.unit}
                      onChange={e => handleIngredientChange(idx, 'unit', e.target.value)}
                    />
                    {formIngredients.length > 1 && (
                      <button type="button" className="remove-ing-btn" onClick={() => removeFormIngredient(idx)}>✕</button>
                    )}
                  </div>
                ))}
                <button type="button" className="btn btn-secondary" style={{padding: '0.4rem 0.8rem', fontSize: '0.85rem', marginTop: '0.5rem'}} onClick={addFormIngredient}>
                  + Add Ingredient row
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Cooking Instructions *</label>
              <textarea 
                className="form-input" 
                rows="4" 
                placeholder="Step 1. Prehead oven...\nStep 2. Mix dry ingredients..."
                value={recipeFormArgs.instructions}
                onChange={e => setRecipeFormArgs({...recipeFormArgs, instructions: e.target.value})}
                required
              />
            </div>

            {/* Drag & Drop GCS upload zone */}
            <div className="form-group">
              <label className="form-label">Upload Recipe Image (will store in Cloud Storage)</label>
              <div 
                className={`dropzone ${dragActive ? 'drag-active' : ''}`}
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
              >
                <div className="dropzone-file-info">
                  <span className="dropzone-icon">📷</span>
                  <p>Drag and drop recipe snapshot here, or click to choose from system files</p>
                  <label htmlFor="file-input-id" style={{color: 'var(--accent-indigo)', textDecoration: 'underline', cursor: 'pointer'}}>
                    Browse device files
                  </label>
                  <input 
                    id="file-input-id" 
                    type="file" 
                    style={{display: 'none'}} 
                    accept="image/*"
                    onChange={e => e.target.files && setImageFile(e.target.files[0])}
                  />
                  {imageFile && (
                    <div className="file-name-display">Selected: {imageFile.name} ({(imageFile.size / 1024).toFixed(1)} KB)</div>
                  )}
                </div>
              </div>
            </div>

            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)} disabled={submittingRecipe}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={submittingRecipe}>
                {submittingRecipe ? <><div className="spinner" style={{width: 14, height: 14, display: 'inline-block', marginRight: '6px'}}></div>Uploading to GCP...</> : 'Save & Publish'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }
}

export default App;
