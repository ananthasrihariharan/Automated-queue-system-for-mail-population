import { useEffect, useState } from 'react'
import { api } from '../../services/api'
import './EmployeeManager.css'

const ALL_ROLES = ['ADMIN', 'PREPRESS', 'CASHIER', 'DISPATCH']

type User = {
  _id: string
  name: string
  phone: string
  roles: string[]
  isActive: boolean
}

export default function EmployeeManager() {
  const [users, setUsers] = useState<User[]>([])
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [roles, setRoles] = useState<string[]>([])

  // Edit states
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')

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
        <div className="role-selection-group">
          {ALL_ROLES.map(role => (
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

        <button
          className="btn-primary"
          onClick={createUser}
          style={{ width: 'auto', padding: '0.75rem 2rem' }}
        >
          Register Employee
        </button>
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
            {users.map(user => {
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
                    <div className="role-tag-container">
                      {ALL_ROLES.map(role => (
                        <label
                          key={role}
                          className={`role-pill-label ${user.roles.includes(role) ? 'active' : ''}`}
                          style={{ fontSize: '0.625rem', padding: '0.25rem 0.625rem' }}
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
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
