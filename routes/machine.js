const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const { machineRepo } = require('../repositories');

/**
 * Machine Master CRUD.
 * GET is open to any authenticated user (CreateJob UPS calculator needs it).
 * Create / update / delete are ADMIN-only.
 */

// GET /api/machines — list all machines
router.get('/', auth, async (req, res) => {
  try {
    const machines = await machineRepo.findAll();
    res.json(machines);
  } catch (err) {
    console.error('[Machines GET Error]:', err.message);
    res.status(500).json({ message: 'Failed to load machines' });
  }
});

// POST /api/machines — create a machine
router.post('/', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ message: 'Machine name is required' });

    const margin = Number(req.body?.printableMargin);
    if (!isFinite(margin) || margin < 0) {
      return res.status(400).json({ message: 'Printable margin must be a non-negative number' });
    }

    const machine = await machineRepo.create({ name, printableMargin: margin });
    res.status(201).json(machine);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ message: 'A machine with that name already exists' });
    console.error('[Machines POST Error]:', err.message);
    res.status(400).json({ message: err.message || 'Failed to create machine' });
  }
});

// PUT /api/machines/:id — update a machine
router.put('/:id', auth, authorize('ADMIN'), async (req, res) => {
  try {
    const payload = {};
    if (req.body?.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ message: 'Machine name cannot be empty' });
      payload.name = name;
    }
    if (req.body?.printableMargin !== undefined) {
      const margin = Number(req.body.printableMargin);
      if (!isFinite(margin) || margin < 0) {
        return res.status(400).json({ message: 'Printable margin must be a non-negative number' });
      }
      payload.printableMargin = margin;
    }

    const machine = await machineRepo.update(req.params.id, payload);
    if (!machine) return res.status(404).json({ message: 'Machine not found' });
    res.json(machine);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ message: 'A machine with that name already exists' });
    if (err.code === 'P2025') return res.status(404).json({ message: 'Machine not found' });
    console.error('[Machines PUT Error]:', err.message);
    res.status(400).json({ message: err.message || 'Failed to update machine' });
  }
});

// DELETE /api/machines/:id — delete a machine
router.delete('/:id', auth, authorize('ADMIN'), async (req, res) => {
  try {
    await machineRepo.remove(req.params.id);
    res.json({ message: 'Machine deleted' });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ message: 'Machine not found' });
    console.error('[Machines DELETE Error]:', err.message);
    res.status(500).json({ message: 'Failed to delete machine' });
  }
});

module.exports = router;
