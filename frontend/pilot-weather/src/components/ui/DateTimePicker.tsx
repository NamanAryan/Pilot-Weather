import { useEffect, useMemo, useRef, useState } from "react";

interface Props {
  value?: string;
  onChange?: (iso: string) => void;
  placeholder?: string;
}

function pad(num: number) {
  return num < 10 ? `0${num}` : String(num);
}

export default function DateTimePicker({ value, onChange, placeholder }: Props) {
  const initial = useMemo(() => {
    if (!value) return { date: "", time: "" };
    const d = new Date(value);
    if (isNaN(d.getTime())) return { date: "", time: "" };
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return { date, time };
  }, [value]);

  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);

  useEffect(() => {
    if (date && time) {
      // Build local ISO-like string without seconds
      const [y, m, d] = date.split("-").map((s) => parseInt(s, 10));
      const [hh, mm] = time.split(":" ).map((s) => parseInt(s, 10));
      const dt = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0);
      if (!isNaN(dt.getTime())) {
        onChange?.(dt.toISOString());
      }
    }
  }, [date, time]);

  return (
    <div className="flex gap-2">
      <input
        type="date"
        className="h-11 border border-gray-200 rounded-md px-3 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        placeholder={placeholder || "YYYY-MM-DD"}
      />
      <input
        type="time"
        className="h-11 border border-gray-200 rounded-md px-3 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        placeholder="HH:MM"
      />
    </div>
  );
}


