const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3456;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const LISTS = ['Ambattur (Sheila)', 'Ambattur (Hamsa)', 'Brownstone'];

// Create table on startup
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS items (
      id SERIAL PRIMARY KEY,
      list_name TEXT NOT NULL,
      item TEXT NOT NULL,
      note TEXT DEFAULT '',
      bought BOOLEAN DEFAULT FALSE,
      added_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

// Get all lists
app.get('/api/lists', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM items ORDER BY id');
    const data = {};
    for (const name of LISTS) data[name] = [];
    for (const row of result.rows) {
      if (data[row.list_name]) {
        data[row.list_name].push({
          id: row.id.toString(),
          item: row.item,
          note: row.note || '',
          bought: row.bought,
          addedAt: row.added_at
        });
      }
    }
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Add item to a list
app.post('/api/lists/:listName/items', async (req, res) => {
  const { listName } = req.params;
  const { item, note } = req.body;

  if (!item || !item.trim()) {
    return res.status(400).json({ error: 'Item name is required' });
  }
  if (!LISTS.includes(listName)) {
    return res.status(404).json({ error: 'List not found' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO items (list_name, item, note) VALUES ($1, $2, $3) RETURNING *',
      [listName, item.trim(), note ? note.trim() : '']
    );
    const row = result.rows[0];
    res.json({ id: row.id.toString(), item: row.item, note: row.note, bought: row.bought, addedAt: row.added_at });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Toggle bought status
app.patch('/api/lists/:listName/items/:itemId', async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE items SET bought = NOT bought WHERE id = $1 RETURNING *',
      [req.params.itemId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Item not found' });
    const row = result.rows[0];
    res.json({ id: row.id.toString(), item: row.item, note: row.note, bought: row.bought, addedAt: row.added_at });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete item
app.delete('/api/lists/:listName/items/:itemId', async (req, res) => {
  try {
    await pool.query('DELETE FROM items WHERE id = $1', [req.params.itemId]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Clear bought items from a list
app.post('/api/lists/:listName/clear-bought', async (req, res) => {
  try {
    await pool.query('DELETE FROM items WHERE list_name = $1 AND bought = true', [req.params.listName]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Grocery list app running at http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
