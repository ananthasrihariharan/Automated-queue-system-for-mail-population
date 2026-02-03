

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
