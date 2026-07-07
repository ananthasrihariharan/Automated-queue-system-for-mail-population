import { useEffect, useState } from 'react'
import { api } from '@core/services/api'
import './EmployeeManager.css' // Reusing EmployeeManager styles for consistency

type Customer = {
    _id: string
    name: string
    phone: string
    isCreditCustomer: boolean
    createdAt: string
}
export default function CustomerManager({ search: propSearch, setSearch: propSetSearch }: { search?: string; setSearch?: (val: string) => void } = {}) {
    const [customers, setCustomers] = useState<Customer[]>([])
    const [localSearch, setLocalSearch] = useState('')
    const search = propSearch !== undefined ? propSearch : localSearch
    const setSearch = propSetSearch !== undefined ? propSetSearch : setLocalSearch

    const [currentPage, setCurrentPage] = useState(1)
    const [rowsPerPage, setRowsPerPage] = useState(20)

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
    const filteredCustomers = customers.filter(c => {
        const nameMatch = (c.name || '').toLowerCase().includes((search || '').toLowerCase());
        const phoneMatch = (c.phone || '').includes(search || '');
        return nameMatch || phoneMatch;
    })

    const totalPages = Math.ceil(filteredCustomers.length / rowsPerPage)
    const paginatedCustomers = filteredCustomers.slice(
        (currentPage - 1) * rowsPerPage,
        currentPage * rowsPerPage
    )

    useEffect(() => {
        if (currentPage > totalPages && totalPages > 0) {
            setCurrentPage(totalPages)
        }
    }, [filteredCustomers.length, totalPages, currentPage])

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
                        onChange={(e) => {
                            setSearch(e.target.value)
                            setCurrentPage(1)
                        }}
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
                            paginatedCustomers.map(c => {
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

            {/* Mobile Customer Cards */}
            <div className="employee-mobile-cards">
                {filteredCustomers.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8', fontWeight: 600 }}>
                        No customers found
                    </div>
                ) : (
                    paginatedCustomers.map((c) => {
                        return (
                            <div
                                key={c._id}
                                className="employee-mobile-card"
                                onClick={() => startEdit(c)}
                            >
                                <div className="card-row-one" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                        <span style={{ fontWeight: 800, fontSize: '0.85rem', color: '#1e293b' }}>{c.name}</span>
                                        <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b' }}>{c.phone}</span>
                                    </div>
                                    <span className={`status-badge ${c.isCreditCustomer ? 'status-paid' : 'status-unpaid'}`} style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem' }}>
                                        {c.isCreditCustomer ? 'Credit' : 'Standard'}
                                    </span>
                                </div>

                                <div className="card-row-two" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', width: '100%', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed #e2e8f0' }}>
                                    <div className="card-action-buttons" style={{ display: 'flex', gap: '0.5rem' }} onClick={(e) => e.stopPropagation()}>
                                        <button
                                            className="action-icon-btn edit"
                                            onClick={() => startEdit(c)}
                                            style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '0.8rem' }}
                                            title="Edit"
                                        >
                                            ✏️
                                        </button>
                                        <button
                                            className="action-icon-btn delete"
                                            onClick={() => handleDelete(c)}
                                            style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '6px', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '0.8rem' }}
                                            title="Delete"
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )
                    })
                )}
            </div>

            {/* Edit Customer Modal Overlay (Mobile only) */}
            {editingId && (
                <div className="luxury-modal-overlay mobile-only-modal" onClick={() => setEditingId(null)}>
                    <div className="luxury-modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Edit Customer</h3>
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
                            <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                                <span className="field-label">Customer Type</span>
                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                                    <button
                                        type="button"
                                        onClick={() => setEditIsCredit(false)}
                                        style={{
                                            flex: 1,
                                            padding: '0.6rem',
                                            borderRadius: '0.5rem',
                                            fontSize: '0.8rem',
                                            fontWeight: 800,
                                            border: !editIsCredit ? '2px solid #0f172a' : '1px solid #cbd5e1',
                                            background: !editIsCredit ? '#f1f5f9' : '#f8fafc',
                                            color: !editIsCredit ? '#0f172a' : '#64748b',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        Standard
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setEditIsCredit(true)}
                                        style={{
                                            flex: 1,
                                            padding: '0.6rem',
                                            borderRadius: '0.5rem',
                                            fontSize: '0.8rem',
                                            fontWeight: 800,
                                            border: editIsCredit ? '2px solid #10b981' : '1px solid #cbd5e1',
                                            background: editIsCredit ? '#ecfdf5' : '#f8fafc',
                                            color: editIsCredit ? '#047857' : '#64748b',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        Credit Account
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn-secondary" onClick={() => setEditingId(null)}>Cancel</button>
                            <button
                                className="btn-primary"
                                onClick={async () => {
                                    await handleUpdate(editingId, { name: editName, phone: editPhone, isCreditCustomer: editIsCredit });
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
                        Page {currentPage} of {totalPages || 1} • {filteredCustomers.length} total
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
