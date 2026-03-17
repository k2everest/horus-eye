import { Input } from "@/components/ui/input";

interface FlagInputProps {
  label: string;
  description: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}

export function FlagInput({ label, description, value, placeholder, onChange }: FlagInputProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex-1 min-w-0 mr-4">
        <code className="font-mono text-xs text-foreground">{label}</code>
        <p className="mt-0.5 text-xs text-muted-foreground truncate">{description}</p>
      </div>
      <Input
        className="w-44 font-mono text-xs bg-background"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
