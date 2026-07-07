const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const { boardRepo } = require('../repositories');

/**
 * Board Master CRUD.
 * GET is open to any authenticated user (the CreateJob UPS calculator needs it).
 * Create / update / delete are ADMIN-only.
 */

// Validate + normalize an incoming sheets array. Returns { sheets } or throws.
function parseSheets(raw) {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) throw new Error('sheets must be an array');
  return raw
    .filter((s) => s && String(s.name || '').trim())
    .map((s) => {
      let width = Number(s.width);
      let height = Number(s.height);
      const qty = Number(s.qty) || 1;

      if (isNaN(width) || isNaN(height)) {
        const parts = String(s.name).split('*');
        width = Number(parts[0]);
        height = Number(parts[1]);
      }

      if (!isFinite(width) || width <= 0 || !isFinite(height) || height <= 0) {
        throw new Error(`Sheet "${s.name}" needs positive width and height`);
      }
      return { name: String(s.name).trim(), width, height, qty };
    });
}

// GET /api/boards — list all boards with their sheets
router.get('/', auth, async (req, res) => {
  try {
    const boards = await boardRepo.findAllWithSheets();
    res.json(boards);
  } catch (err) {
    console.error('[Boards GET Error]:', err.message);
    res.status(500).json({ message: 'Failed to load boards' });
  }
});

// POST /api/boards — create a board with nested sheets
router.post('/', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ message: 'Board name is required' });

    const productId = req.body?.productId ? String(req.body.productId).trim() : null;
    const originalName = req.body?.originalName ? String(req.body.originalName).trim() : null;
    const masterSize = req.body?.masterSize ? String(req.body.masterSize).trim() : null;
    const storingSize = req.body?.storingSize ? String(req.body.storingSize).trim() : null;
    const mediaBehavior = String(req.body?.mediaBehavior || 'DIRECT').trim();

    const sheets = parseSheets(req.body?.sheets) || [];
    const board = await boardRepo.create({
      name,
      productId,
      originalName,
      masterSize,
      storingSize,
      mediaBehavior,
      sheets
    });
    res.status(201).json(board);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ message: 'A board with that name already exists' });
    console.error('[Boards POST Error]:', err.message);
    res.status(400).json({ message: err.message || 'Failed to create board' });
  }
});

// PUT /api/boards/:id — update a board and replace its sheets
router.put('/:id', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const payload = {};
    if (req.body?.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ message: 'Board name cannot be empty' });
      payload.name = name;
    }
    if (req.body?.productId !== undefined) payload.productId = req.body.productId ? String(req.body.productId).trim() : null;
    if (req.body?.originalName !== undefined) payload.originalName = req.body.originalName ? String(req.body.originalName).trim() : null;
    if (req.body?.masterSize !== undefined) payload.masterSize = req.body.masterSize ? String(req.body.masterSize).trim() : null;
    if (req.body?.storingSize !== undefined) payload.storingSize = req.body.storingSize ? String(req.body.storingSize).trim() : null;
    if (req.body?.mediaBehavior !== undefined) payload.mediaBehavior = req.body.mediaBehavior ? String(req.body.mediaBehavior).trim() : "DIRECT";

    const sheets = parseSheets(req.body?.sheets);
    if (sheets !== undefined) payload.sheets = sheets;

    const board = await boardRepo.update(req.params.id, payload);
    if (!board) return res.status(404).json({ message: 'Board not found' });
    res.json(board);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ message: 'A board with that name already exists' });
    if (err.code === 'P2025') return res.status(404).json({ message: 'Board not found' });
    console.error('[Boards PUT Error]:', err.message);
    res.status(400).json({ message: err.message || 'Failed to update board' });
  }
});

// DELETE /api/boards/:id — delete a board (cascade-deletes its sheets)
router.delete('/:id', auth, authorize('ADMIN'), async (req, res) => {
  try {
    await boardRepo.remove(req.params.id);
    res.json({ message: 'Board deleted' });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ message: 'Board not found' });
    console.error('[Boards DELETE Error]:', err.message);
    res.status(500).json({ message: 'Failed to delete board' });
  }
});

module.exports = router;
