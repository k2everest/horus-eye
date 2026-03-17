import { Switch } from "@/components/ui/switch";

interface FlagToggleProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function FlagToggle({ label, description, checked, onChange }: FlagToggleProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex-1 min-w-0 mr-4">
        <code className="font-mono text-xs text-foreground">{label}</code>
        <p className="mt-0.5 text-xs text-muted-foreground truncate">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
