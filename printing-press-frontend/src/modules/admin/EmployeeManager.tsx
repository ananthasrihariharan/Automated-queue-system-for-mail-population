import { useEffect, useState } from 'react'
import { api } from '../../services/api'
import './AdminDashboard.css'

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
    <div>
      {/* CREATE EMPLOYEE */}
      <div className="employee-form-container">
        <h3 className="employee-form-title">Add Employee</h3>

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
          <input
            className="form-input"
            style={{ flex: 1 }}
            placeholder="Name"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <input
            className="form-input"
            style={{ flex: 1 }}
            placeholder="Phone"
            value={phone}
            onChange={e => setPhone(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem' }}>
          {ALL_ROLES.map(role => (
            <label key={role} className="checkbox-label">
              <input
                type="checkbox"
                className="checkbox-input"
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
        >
          Add Employee
        </button>
      </div>

      {/* EMPLOYEE LIST */}
      <table className="admin-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Phone</th>
            <th>Roles</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          {users.map(user => {
            const isEditing = editingId === user._id

            return (
              <tr key={user._id} className="admin-row">
                <td>
                  {isEditing ? (
                    <input
                      className="form-input"
                      style={{ padding: '0.25rem', fontSize: '0.875rem' }}
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                    />
                  ) : (
                    <span style={{ fontWeight: 600 }}>{user.name}</span>
                  )}
                </td>
                <td>
                  {isEditing ? (
                    <input
                      className="form-input"
                      style={{ padding: '0.25rem', fontSize: '0.875rem' }}
                      value={editPhone}
                      onChange={e => setEditPhone(e.target.value)}
                    />
                  ) : (
                    user.phone
                  )}
                </td>

                <td>
                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    {ALL_ROLES.map(role => (
                      <label
                        key={role}
                        className="checkbox-label"
                        style={{ fontSize: '0.75rem' }}
                      >
                        <input
                          type="checkbox"
                          className="checkbox-input"
                          style={{ width: '0.8rem', height: '0.8rem' }}
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
                    {user.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>

                <td>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    {isEditing ? (
                      <>
                        <button
                          className="action-link"
                          style={{ color: '#10b981' }}
                          onClick={() => handleUpdate(user._id, { name: editName, phone: editPhone })}
                        >
                          Save
                        </button>
                        <button
                          className="action-link"
                          style={{ color: '#ef4444' }}
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="action-link"
                          onClick={() => startEdit(user)}
                        >
                          Edit
                        </button>
                        <div style={{ width: '1px', height: '1rem', background: '#e5e7eb' }}></div>
                        <button
                          className="action-link"
                          style={{ color: user.isActive ? '#ef4444' : '#10b981' }}
                          onClick={() =>
                            handleUpdate(user._id, { isActive: !user.isActive })
                          }
                        >
                          {user.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <div style={{ width: '1px', height: '1rem', background: '#e5e7eb' }}></div>
                        <button
                          className="action-link"
                          style={{ color: '#ef4444' }}
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
  )
}
