import { ReactNode } from "react";
import { Icon } from "@phosphor-icons/react";

interface EmptyStateProps {
  icon: Icon;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ icon: IconComponent, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center animate-in fade-in-50">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
        <IconComponent className="h-8 w-8 text-muted-foreground" weight="duotone" />
      </div>
      <h3 className="text-lg font-medium">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-sm mt-1 mb-6">
        {description}
      </p>
      {action && <div>{action}</div>}
    </div>
  );
}
