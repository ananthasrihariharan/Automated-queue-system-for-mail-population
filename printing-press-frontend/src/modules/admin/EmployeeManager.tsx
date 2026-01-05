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

  const loadUsers = async () => {
    const res = await api.get('/api/admin/users')
    setUsers(res.data)
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

    await api.post('/api/admin/users', {
      name,
      phone,
      roles
    })

    setName('')
    setPhone('')
    setRoles([])
    loadUsers()
  }

  const updateRoles = async (id: string, roles: string[]) => {
    await api.patch(`/api/admin/users/${id}/roles`, { roles })
    loadUsers()
  }

  const toggleActive = async (id: string, isActive: boolean) => {
    await api.patch(`/api/admin/users/${id}/status`, { isActive })
    loadUsers()
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
          {users.map(user => (
            <tr key={user._id} className="admin-row">
              <td style={{ fontWeight: 600 }}>{user.name}</td>
              <td>{user.phone}</td>

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
                          updateRoles(
                            user._id,
                            user.roles.includes(role)
                              ? user.roles.filter(r => r !== role)
                              : [...user.roles, role]
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
                <button
                  className="action-link"
                  onClick={() =>
                    toggleActive(user._id, !user.isActive)
                  }
                >
                  {user.isActive ? 'Deactivate' : 'Activate'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
