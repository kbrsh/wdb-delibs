import * as React from "react";
import { cn } from "@/lib/utils";

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, ...props }, ref) => (
    <label className="flex items-center gap-3 text-sm text-foreground">
      <input
        ref={ref}
        type="checkbox"
        className={cn(
          "h-4 w-4 rounded border border-input text-primary focus:ring-ring",
          className
        )}
        {...props}
      />
      {label ? <span>{label}</span> : null}
    </label>
  )
);

Checkbox.displayName = "Checkbox";
