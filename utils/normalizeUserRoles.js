const LEGACY_ROLE_ALIASES = {
  'FINISHING CUTTING': 'FINISHING_CUTTING',
  'FINISHING DIE CUTTING': 'FINISHING_DIE_CUTTING',
  'FINISHING CREASING': 'FINISHING_CREASING',
  'FINISHING CORNER CUT': 'FINISHING_CORNER_CUT',
  'FINISHING CORNER CUTTING': 'FINISHING_CORNER_CUT',
}

function normalizeUserRoles(roles = []) {
  return roles.map((r) => {
    const upper = String(r || '').trim().toUpperCase()
    return LEGACY_ROLE_ALIASES[upper] || upper.replace(/\s+/g, '_')
  })
}

module.exports = { normalizeUserRoles, LEGACY_ROLE_ALIASES }

