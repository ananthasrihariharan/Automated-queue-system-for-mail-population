import { useEffect, useState } from 'react'
import { api } from '../../services/api'

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
      <h2 className="text-xl font-bold mb-4">Employees</h2>

      {/* CREATE EMPLOYEE */}
      <div className="border p-4 mb-6">
        <h3 className="font-semibold mb-2">Add Employee</h3>

        <div className="flex gap-3 mb-3">
          <input
            className="border p-2"
            placeholder="Name"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <input
            className="border p-2"
            placeholder="Phone"
            value={phone}
            onChange={e => setPhone(e.target.value)}
          />
        </div>

        <div className="flex gap-4 mb-3">
          {ALL_ROLES.map(role => (
            <label key={role} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={roles.includes(role)}
                onChange={() => toggleRole(role)}
              />
              {role}
            </label>
          ))}
        </div>

        <button
          className="bg-black text-white px-4 py-2"
          onClick={createUser}
        >
          Add Employee
        </button>
      </div>

      {/* EMPLOYEE LIST */}
      <table className="w-full border">
        <thead className="bg-gray-100">
          <tr>
            <th className="border p-2">Name</th>
            <th className="border p-2">Phone</th>
            <th className="border p-2">Roles</th>
            <th className="border p-2">Status</th>
            <th className="border p-2">Actions</th>
          </tr>
        </thead>

        <tbody>
          {users.map(user => (
            <tr key={user._id}>
              <td className="border p-2">{user.name}</td>
              <td className="border p-2">{user.phone}</td>

              <td className="border p-2">
                {ALL_ROLES.map(role => (
                  <label
                    key={role}
                    className="flex items-center gap-1"
                  >
                    <input
                      type="checkbox"
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
              </td>

              <td className="border p-2">
                {user.isActive ? 'Active' : 'Inactive'}
              </td>

              <td className="border p-2">
                <button
                  className="underline"
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
