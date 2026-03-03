const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3456;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const LISTS = ['Ambattur (Sheila)', 'Ambattur (Hamsa)', 'Brownstone'];

// Initialize database table
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS items (
      id SERIAL PRIMARY KEY,
      list_name TEXT NOT NULL,
      item TEXT NOT NULL,
      note TEXT DEFAULT '',
      bought BOOLEAN DEFAULT false,
      added_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

// Get all lists
app.get('/api/lists', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM items ORDER BY bought ASC, added_at ASC'
    );
    const data = {};
    for (const name of LISTS) {
      data[name] = result.rows
        .filter(r => r.list_name === name)
        .map(r => ({
          id: r.id.toString(),
          item: r.item,
          note: r.note,
          bought: r.bought,
          addedAt: r.added_at
        }));
    }
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
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
    const r = result.rows[0];
    res.json({ id: r.id.toString(), item: r.item, note: r.note, bought: r.bought, addedAt: r.added_at });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Toggle bought status
app.patch('/api/lists/:listName/items/:itemId', async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE items SET bought = NOT bought WHERE id = $1 AND list_name = $2 RETURNING *',
      [req.params.itemId, req.params.listName]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    const r = result.rows[0];
    res.json({ id: r.id.toString(), item: r.item, note: r.note, bought: r.bought, addedAt: r.added_at });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Delete item
app.delete('/api/lists/:listName/items/:itemId', async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM items WHERE id = $1 AND list_name = $2',
      [req.params.itemId, req.params.listName]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Clear bought items from a list
app.post('/api/lists/:listName/clear-bought', async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM items WHERE list_name = $1 AND bought = true',
      [req.params.listName]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Grocery list app running on port ${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
