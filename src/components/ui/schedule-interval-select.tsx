import { cn } from "@/lib/utils";

type ScheduleIntervalSelectProps = {
    name: string;
    defaultValue: number;
    unit: "minutes" | "hours";
    invalid?: boolean;
    className?: string;
};

const minuteOptions = [
    [15, "Every 15 minutes"],
    [60, "Every hour"],
    [360, "Every 6 hours"],
    [720, "Every 12 hours"],
    [1440, "Daily"],
    [10080, "Weekly"],
] as const;

const hourOptions = [
    [1, "Every hour"],
    [6, "Every 6 hours"],
    [12, "Every 12 hours"],
    [24, "Daily"],
    [168, "Weekly"],
] as const;

function customLabel(value: number, unit: "minutes" | "hours") {
    if (unit === "minutes" && value % 1440 === 0) {
        const days = value / 1440;

        return `Every ${days} ${days === 1 ? "day" : "days"}`;
    }

    if (unit === "minutes" && value % 60 === 0) {
        const hours = value / 60;

        return `Every ${hours} ${hours === 1 ? "hour" : "hours"}`;
    }

    return `Every ${value} ${unit}`;
}

export function ScheduleIntervalSelect({
    name,
    defaultValue,
    unit,
    invalid,
    className,
}: ScheduleIntervalSelectProps) {
    const options = unit === "minutes" ? minuteOptions : hourOptions;
    const hasDefault = options.some(([value]) => value === defaultValue);

    return (
        <select
            name={name}
            defaultValue={String(defaultValue)}
            aria-invalid={invalid || undefined}
            className={cn(
                "min-h-11 w-full rounded-lg border border-cream/[0.10] bg-cream/[0.04] px-3 py-2 text-sm text-foreground outline-none transition focus:border-focus focus:ring-2 focus:ring-focus/25 aria-[invalid=true]:border-accent-wine",
                className,
            )}
        >
            {!hasDefault ? (
                <option value={defaultValue}>{customLabel(defaultValue, unit)} (current)</option>
            ) : null}
            {options.map(([value, label]) => (
                <option key={value} value={value}>
                    {label}
                </option>
            ))}
        </select>
    );
}
