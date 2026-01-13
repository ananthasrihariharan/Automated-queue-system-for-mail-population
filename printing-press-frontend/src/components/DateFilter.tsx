

interface DateFilterProps {
    value: string
    onChange: (date: string) => void
}

export default function DateFilter({ value, onChange }: DateFilterProps) {
    // Helper to quickly set 'Today'
    const setToday = () => {
        const today = new Date().toISOString().split('T')[0]
        onChange(today)
    }

    // Clear filter (if we want to allow 'All Time' - though user asked for current date default)
    // For now, we stick to specific date selection as primary interaction.

    return (
        <div className="date-filter-group">
            <svg className="date-filter-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            <input
                type="date"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="date-filter-input"
            />
            {value && value !== new Date().toISOString().split('T')[0] && (
                <button
                    onClick={setToday}
                    className="date-filter-reset"
                    title="Reset to Today"
                >
                    Today
                </button>
            )}
        </div>
    )
}
