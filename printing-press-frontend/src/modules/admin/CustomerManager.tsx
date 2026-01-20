import { useEffect, useState } from 'react'
import { api } from '../../services/api'
import './EmployeeManager.css' // Reusing EmployeeManager styles for consistency

type Customer = {
    _id: string
    name: string
    phone: string
    isCreditCustomer: boolean
    createdAt: string
}

export default function CustomerManager() {
    const [customers, setCustomers] = useState<Customer[]>([])
    const [search, setSearch] = useState('')

    // Edit states
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editName, setEditName] = useState('')
    const [editPhone, setEditPhone] = useState('')
    const [editIsCredit, setEditIsCredit] = useState(false)

    const loadCustomers = async () => {
        try {
            const res = await api.get('/api/admin/customers')
            setCustomers(res.data)
        } catch (err: any) {
            alert(err.response?.data?.message || 'Failed to load customers')
        }
    }

    useEffect(() => {
        loadCustomers()
    }, [])

    const handleUpdate = async (id: string, data: Partial<Customer>) => {
        try {
            await api.patch(`/api/admin/customers/${id}`, data)
            setEditingId(null)
            loadCustomers()
        } catch (err: any) {
            alert(err.response?.data?.message || 'Update failed')
        }
    }

    const startEdit = (c: Customer) => {
        setEditingId(c._id)
        setEditName(c.name)
        setEditPhone(c.phone)
        setEditIsCredit(c.isCreditCustomer)
    }

    const handleDelete = async (c: Customer) => {
        if (!window.confirm(`Are you sure you want to PERMANENTLY DELETE customer "${c.name}"?`)) return

        try {
            await api.delete(`/api/admin/customers/${c._id}`)
            loadCustomers()
        } catch (err: any) {
            alert(err.response?.data?.message || 'Delete failed')
        }
    }

    // Filtered Customers
    const filteredCustomers = customers.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.phone.includes(search)
    )

    return (
        <div className="employee-manager-root">
            {/* HEADER & SEARCH */}
            <div className="employee-form-container" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 className="employee-form-title" style={{ margin: 0 }}>Customer Management</h3>

                <div className="search-wrapper" style={{ width: '300px' }}>
                    <svg className="search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                        type="text"
                        placeholder="Search Name or Phone..."
                        className="filter-input search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            {/* CUSTOMER LIST */}
            <div className="dispatch-table-container">
                <table className="dispatch-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Phone</th>
                            <th>Type</th>
                            <th className="text-right">Actions</th>
                        </tr>
                    </thead>

                    <tbody>
                        {filteredCustomers.length === 0 ? (
                            <tr>
                                <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                                    No customers found.
                                </td>
                            </tr>
                        ) : (
                            filteredCustomers.map(c => {
                                const isEditing = editingId === c._id

                                return (
                                    <tr key={c._id} className="dispatch-row">
                                        <td>
                                            {isEditing ? (
                                                <input
                                                    className="table-edit-input"
                                                    value={editName}
                                                    onChange={e => setEditName(e.target.value)}
                                                />
                                            ) : (
                                                <span style={{ fontWeight: 800 }}>{c.name}</span>
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
                                                <span style={{ fontWeight: 600, color: '#64748b' }}>{c.phone}</span>
                                            )}
                                        </td>

                                        <td>
                                            {isEditing ? (
                                                <label className="toggle-label" style={{ margin: 0 }}>
                                                    <input
                                                        type="checkbox"
                                                        className="toggle-input"
                                                        checked={editIsCredit}
                                                        onChange={(e) => setEditIsCredit(e.target.checked)}
                                                    />
                                                    <span className="toggle-switch"></span>
                                                    <span className="toggle-text">Credit Customer</span>
                                                </label>
                                            ) : (
                                                c.isCreditCustomer ? (
                                                    <span className="status-badge status-paid">Credit Account</span>
                                                ) : (
                                                    <span className="status-badge status-unpaid">Standard</span>
                                                )
                                            )}
                                        </td>

                                        <td className="text-right">
                                            <div className="action-group">
                                                {isEditing ? (
                                                    <>
                                                        <button
                                                            className="action-btn-styled success"
                                                            onClick={() => handleUpdate(c._id, { name: editName, phone: editPhone, isCreditCustomer: editIsCredit })}
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
                                                            onClick={() => startEdit(c)}
                                                        >
                                                            Edit
                                                        </button>
                                                        <button
                                                            className="action-btn-styled danger"
                                                            onClick={() => handleDelete(c)}
                                                        >
                                                            Delete
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
