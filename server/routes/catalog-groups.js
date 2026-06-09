import express from 'express';
import { getGroups, saveGroups } from '../lib/project/catalog-group-manager.js';

const router = express.Router({ mergeParams: true });

router.get('/:projectName/catalog-groups', (req, res) => {
  try {
    return res.json(getGroups(req.params.projectName));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.put('/:projectName/catalog-groups', (req, res) => {
  try {
    const { groups } = req.body;
    if (!Array.isArray(groups)) return res.status(400).json({ error: 'groups must be an array' });
    return res.json(saveGroups(req.params.projectName, groups));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
