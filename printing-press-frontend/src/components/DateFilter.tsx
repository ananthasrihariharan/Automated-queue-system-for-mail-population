

interface DateFilterProps {
    value: string
    onChange: (date: string) => void
    label?: string
}

export default function DateFilter({ value, onChange, label = "Filter Date" }: DateFilterProps) {
    // Helper to quickly set 'Today'
    const setToday = () => {
        const today = new Date().toISOString().split('T')[0]
        onChange(today)
    }

    // Clear filter (if we want to allow 'All Time' - though user asked for current date default)
    // For now, we stick to specific date selection as primary interaction.

    return (
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-md px-2 py-1 shadow-sm">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{label}</span>
            <input
                type="date"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="text-sm font-semibold text-gray-900 border-none outline-none focus:ring-0 cursor-pointer bg-transparent p-1"
                style={{ fontFamily: 'inherit' }}
            />
            {value !== new Date().toISOString().split('T')[0] && (
                <button
                    onClick={setToday}
                    className="ml-1 text-xs font-bold text-blue-600 hover:text-blue-800 px-2 py-0.5 bg-blue-50 rounded"
                    title="Reset to Today"
                >
                    TODAY
                </button>
            )}
        </div>
    )
}
