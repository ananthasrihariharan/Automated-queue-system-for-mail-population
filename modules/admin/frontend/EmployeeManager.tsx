import { useEffect, useState } from 'react'
import { api } from '@core/services/api'
import './EmployeeManager.css'

const ROLE_GROUPS = [
  {
    label: 'Core',
    roles: ['ADMIN', 'PREPRESS', 'CASHIER', 'DISPATCH'],
  },
  {
    label: 'Production',
    roles: ['PRESS', 'POST_PRESS', 'FINISHING'],
  },
  {
    label: 'Finishing Sub-Roles',
    roles: ['FINISHING_CUTTING', 'FINISHING_DIE_CUTTING', 'FINISHING_CREASING', 'FINISHING_CORNER_CUT'],
  },
]

type User = {
  _id: string
  name: string
  phone: string
  roles: string[]
  isActive: boolean
}

export default function EmployeeManager({ search: propSearch, setSearch: propSetSearch }: { search?: string; setSearch?: (val: string) => void } = {}) {
  const [users, setUsers] = useState<User[]>([])
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [roles, setRoles] = useState<string[]>([])

  // Search & Pagination States
  const [localSearch, setLocalSearch] = useState('')
  const search = propSearch !== undefined ? propSearch : localSearch
  const setSearch = propSetSearch !== undefined ? propSetSearch : setLocalSearch

  const [currentPage, setCurrentPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(20)

  // Edit states
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')

  // Modal states for mobile viewports
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [selectedRolesUser, setSelectedRolesUser] = useState<User | null>(null)

  const loadUsers = async () => {
    try {
      const res = await api.get('/api/admin/users')
      setUsers(res.data)
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to load users')
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  const toggleRole = (role: string) => {
    setRoles(prev =>
      prev.includes(role)
        ? prev.filter(r => r !== role)
        : [...prev, role]
    )
  }

  const createUser = async () => {
    if (!name || !phone || roles.length === 0) {
      alert('Name, phone and at least one role required')
      return
    }

    try {
      await api.post('/api/admin/users', {
        name,
        phone,
        roles,
        password: `${name.split(' ')[0]}@${phone.slice(-5)}` // Default password
      })

      setName('')
      setPhone('')
      setRoles([])
      loadUsers()
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to create user')
    }
  }

  const handleUpdate = async (id: string, data: Partial<User>) => {
    try {
      await api.patch(`/api/admin/users/${id}`, data)
      setEditingId(null)
      loadUsers()
    } catch (err: any) {
      alert(err.response?.data?.message || 'Update failed')
    }
  }

  const startEdit = (user: User) => {
    setEditingId(user._id)
    setEditName(user.name)
    setEditPhone(user.phone)
  }

  const handleDelete = async (user: User) => {
    if (!window.confirm(`Are you sure you want to PERMANENTLY DELETE employee "${user.name}"? This action cannot be undone.`)) return

    try {
      await api.delete(`/api/admin/users/${user._id}`)
      loadUsers()
    } catch (err: any) {
      alert(err.response?.data?.message || 'Delete failed')
    }
  }

  // Filtered & Paginated Users
  const filteredUsers = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.phone.includes(search)
  )

  const totalPages = Math.ceil(filteredUsers.length / rowsPerPage)
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  )

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages)
    }
  }, [filteredUsers.length, totalPages, currentPage])

  return (
    <div className="employee-manager-root">
      {/* CREATE EMPLOYEE */}
      <div className="employee-form-container">
        <h3 className="employee-form-title">Add New Employee</h3>

        <div className="form-row">
          <div className="form-group">
            <span style={{ fontSize: '0.625rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.375rem', display: 'block' }}>Full Name</span>
            <input
              className="filter-input"
              style={{ width: '100%' }}
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          <div className="form-group">
            <span style={{ fontSize: '0.625rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.375rem', display: 'block' }}>Phone Number</span>
            <input
              className="filter-input"
              style={{ width: '100%' }}
              value={phone}
              onChange={e => setPhone(e.target.value)}
            />
          </div>
        </div>

        <span style={{ fontSize: '0.625rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.75rem', display: 'block' }}>Assign Roles</span>
        <div className="role-selection-group" style={{ gap: '0.75rem' }}>
          {ROLE_GROUPS.map(group => (
            <div key={group.label}>
              <div style={{ fontSize: '0.6rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.375rem', paddingBottom: '0.2rem', borderBottom: '1px solid #e2e8f0' }}>
                {group.label}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                {group.roles.map(role => (
                  <label key={role} className={`role-pill-label ${roles.includes(role) ? 'active' : ''}`}>
                    <input
                      type="checkbox"
                      className="role-pill-input"
                      checked={roles.includes(role)}
                      onChange={() => toggleRole(role)}
                    />
                    {role}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <button
          className="btn-primary"
          onClick={createUser}
          style={{ width: 'auto', padding: '0.75rem 2rem' }}
        >
          Register Employee
        </button>
      </div>

      {/* EMPLOYEE LIST HEADER & SEARCH */}
      <div className="employee-form-container list-header-container" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: '2rem', marginBottom: '1rem' }}>
        <h3 className="employee-form-title" style={{ margin: 0 }}>Team Members</h3>
        <button className="btn-primary add-employee-mobile-btn" onClick={() => setIsAddModalOpen(true)}>+ Add Employee</button>

        <div className="search-wrapper" style={{ width: '300px' }}>
          <svg className="search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search Name or Phone..."
            className="filter-input search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setCurrentPage(1)
            }}
          />
        </div>
      </div>

      {/* EMPLOYEE LIST */}
      <div className="dispatch-table-container">
        <table className="dispatch-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Roles</th>
              <th>Status</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>

          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                  No employees found.
                </td>
              </tr>
            ) : (
              paginatedUsers.map(user => {
              const isEditing = editingId === user._id

              return (
                <tr key={user._id} className="dispatch-row">
                  <td>
                    {isEditing ? (
                      <input
                        className="table-edit-input"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                      />
                    ) : (
                      <span style={{ fontWeight: 800 }}>{user.name}</span>
                    )}
                  </td>
                  <td>
                    {isEditing ? (
                      <input
                        className="table-edit-input"
                        value={editPhone}
                        onChange={e => setEditPhone(e.target.value)}
                      />
                    ) : (
                      <span style={{ fontWeight: 600, color: '#64748b' }}>{user.phone}</span>
                    )}
                  </td>

                  <td>
                    <div className="role-tag-container" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      {ROLE_GROUPS.map(group => (
                        <div key={group.label}>
                          <div style={{ fontSize: '0.55rem', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.2rem' }}>
                            {group.label}
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                            {group.roles.map(role => (
                              <label
                                key={role}
                                className={`role-pill-label ${user.roles.includes(role) ? 'active' : ''}`}
                                style={{ fontSize: '0.6rem', padding: '0.2rem 0.5rem' }}
                              >
                                <input
                                  type="checkbox"
                                  className="role-pill-input"
                                  checked={user.roles.includes(role)}
                                  onChange={() =>
                                    handleUpdate(
                                      user._id,
                                      {
                                        roles: user.roles.includes(role)
                                          ? user.roles.filter(r => r !== role)
                                          : [...user.roles, role]
                                      }
                                    )
                                  }
                                />
                                {role}
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </td>

                  <td>
                    <span className={`status-badge ${user.isActive ? 'status-paid' : 'status-unpaid'}`}>
                      {user.isActive ? 'Active' : 'Deactivated'}
                    </span>
                  </td>

                  <td className="text-right">
                    <div className="action-group">
                      {isEditing ? (
                        <>
                          <button
                            className="action-btn-styled success"
                            onClick={() => handleUpdate(user._id, { name: editName, phone: editPhone })}
                          >
                            Save
                          </button>
                          <button
                            className="action-btn-styled danger"
                            onClick={() => setEditingId(null)}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="action-btn-styled"
                            onClick={() => startEdit(user)}
                          >
                            Edit
                          </button>
                          <button
                            className={`action-btn-styled ${user.isActive ? 'danger' : 'success'}`}
                            onClick={() =>
                              handleUpdate(user._id, { isActive: !user.isActive })
                            }
                          >
                            {user.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                          <button
                            className="action-btn-styled danger"
                            onClick={() => handleDelete(user)}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            }))}
          </tbody>
        </table>
      </div>

      {/* Mobile Employee Cards */}
      <div className="employee-mobile-cards">
        {filteredUsers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8', fontWeight: 600 }}>
            No employees found
          </div>
        ) : (
          paginatedUsers.map((user) => {
            const mainRole = user.roles[0] || 'NONE';
            
            return (
              <div
                key={user._id}
                className="employee-mobile-card"
                onClick={() => setSelectedRolesUser(user)}
              >
                <div className="card-row-one" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                    <span style={{ fontWeight: 800, fontSize: '0.85rem', color: '#1e293b' }}>{user.name}</span>
                    <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b' }}>{user.phone}</span>
                  </div>
                  <span className={`status-badge ${user.isActive ? 'status-paid' : 'status-unpaid'}`} style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem' }}>
                    {user.isActive ? 'Active' : 'Deactivated'}
                  </span>
                </div>

                <div className="card-row-two" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed #e2e8f0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8' }}>Main Role:</span>
                    <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#475569', background: '#f1f5f9', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>{mainRole}</span>
                    {user.roles.length > 1 && (
                      <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#6366f1', background: '#e0e7ff', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>+{user.roles.length - 1} more</span>
                    )}
                  </div>
                  
                  <div className="card-action-buttons" style={{ display: 'flex', gap: '0.5rem' }} onClick={(e) => e.stopPropagation()}>
                    <button
                      className="action-icon-btn edit"
                      onClick={() => startEdit(user)}
                      style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '0.8rem' }}
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button
                      className={`action-icon-btn ${user.isActive ? 'deactivate' : 'activate'}`}
                      onClick={() => handleUpdate(user._id, { isActive: !user.isActive })}
                      style={{ background: user.isActive ? '#fee2e2' : '#d1fae5', border: '1px solid ' + (user.isActive ? '#fecaca' : '#a7f3d0'), borderRadius: '6px', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '0.8rem' }}
                      title={user.isActive ? 'Deactivate' : 'Activate'}
                    >
                      {user.isActive ? '🔒' : '🔓'}
                    </button>
                    <button
                      className="action-icon-btn delete"
                      onClick={() => handleDelete(user)}
                      style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '6px', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '0.8rem' }}
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add Employee Modal Overlay */}
      {isAddModalOpen && (
        <div className="luxury-modal-overlay" onClick={() => setIsAddModalOpen(false)}>
          <div className="luxury-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add New Employee</h3>
              <button className="modal-close-btn" onClick={() => setIsAddModalOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <span className="field-label">Full Name</span>
                <input
                  className="filter-input"
                  style={{ width: '100%' }}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter name"
                />
              </div>
              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <span className="field-label">Phone Number</span>
                <input
                  className="filter-input"
                  style={{ width: '100%' }}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Enter phone number"
                />
              </div>

              <span className="field-label" style={{ marginBottom: '0.5rem', display: 'block' }}>Assign Roles</span>
              <div className="role-selection-group" style={{ gap: '0.75rem', display: 'flex', flexDirection: 'column' }}>
                {ROLE_GROUPS.map((group) => (
                  <div key={group.label}>
                    <div className="group-label">{group.label}</div>
                    <div className="role-pills">
                      {group.roles.map((role) => (
                        <label key={role} className={`role-pill-label ${roles.includes(role) ? 'active' : ''}`}>
                          <input
                            type="checkbox"
                            className="role-pill-input"
                            checked={roles.includes(role)}
                            onChange={() => toggleRole(role)}
                          />
                          {role}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setIsAddModalOpen(false)}>Cancel</button>
              <button
                className="btn-primary"
                onClick={() => {
                  createUser();
                  setIsAddModalOpen(false);
                }}
              >
                Register Employee
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detailed Roles Modal Overlay */}
      {selectedRolesUser && (
        <div className="luxury-modal-overlay" onClick={() => setSelectedRolesUser(null)}>
          <div className="luxury-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Roles: {selectedRolesUser.name}</h3>
              <button className="modal-close-btn" onClick={() => setSelectedRolesUser(null)}>×</button>
            </div>
            <div className="modal-body">
              <span className="field-label" style={{ marginBottom: '0.5rem', display: 'block' }}>Manage Employee Roles</span>
              <div className="role-selection-group" style={{ gap: '0.75rem', display: 'flex', flexDirection: 'column' }}>
                {ROLE_GROUPS.map((group) => (
                  <div key={group.label}>
                    <div className="group-label">{group.label}</div>
                    <div className="role-pills">
                      {group.roles.map((role) => {
                        const hasRole = selectedRolesUser.roles.includes(role);
                        return (
                          <label key={role} className={`role-pill-label ${hasRole ? 'active' : ''}`}>
                            <input
                              type="checkbox"
                              className="role-pill-input"
                              checked={hasRole}
                              onChange={async () => {
                                const updatedRoles = hasRole
                                  ? selectedRolesUser.roles.filter((r) => r !== role)
                                  : [...selectedRolesUser.roles, role];
                                
                                // Call api update
                                await handleUpdate(selectedRolesUser._id, { roles: updatedRoles });
                                
                                // Keep modal state updated
                                setSelectedRolesUser((prev: any) => prev ? { ...prev, roles: updatedRoles } : null);
                              }}
                            />
                            {role}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-primary" onClick={() => setSelectedRolesUser(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Employee Modal Overlay (Mobile only) */}
      {editingId && (
        <div className="luxury-modal-overlay mobile-only-modal" onClick={() => setEditingId(null)}>
          <div className="luxury-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Employee</h3>
              <button className="modal-close-btn" onClick={() => setEditingId(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <span className="field-label">Full Name</span>
                <input
                  className="filter-input"
                  style={{ width: '100%' }}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Enter name"
                />
              </div>
              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <span className="field-label">Phone Number</span>
                <input
                  className="filter-input"
                  style={{ width: '100%' }}
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="Enter phone number"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setEditingId(null)}>Cancel</button>
              <button
                className="btn-primary"
                onClick={async () => {
                  await handleUpdate(editingId, { name: editName, phone: editPhone });
                  setEditingId(null);
                }}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pagination / Controls Footer */}
      <div className="admin-queue-footer" style={{ marginTop: '1.5rem', borderRadius: '0.75rem', border: '1px solid #cbd5e1' }}>
        <div className="pagination-controls-hub">
          <div className="pagination-info">
            Page {currentPage} of {totalPages || 1} • {filteredUsers.length} total
          </div>
          <div className="pagination-buttons">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="btn-page-luxury"
            >
              ← PREV
            </button>
            <button
              onClick={() =>
                setCurrentPage((p) => Math.min(totalPages || 1, p + 1))
              }
              disabled={currentPage >= (totalPages || 1)}
              className="btn-page-luxury"
            >
              NEXT →
            </button>
          </div>
        </div>

        <div className="footer-density-controls">
          <div className="density-row">
            <span className="density-label">Rows per page:</span>
            <select
              className="density-select"
              value={rowsPerPage}
              onChange={(e) => {
                setRowsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}
