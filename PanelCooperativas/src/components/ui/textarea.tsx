import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-24 resize-none py-3 leading-relaxed w-full min-w-0 rounded-md border border-input-border bg-background px-4 text-base md:text-[15px] transition-colors outline-none placeholder:text-muted-foreground placeholder:font-normal placeholder-shown:border-transparent placeholder-shown:bg-surface dark:placeholder-shown:border-border-strong/35 focus-visible:border-accent-strong dark:focus-visible:border-accent-strong focus-visible:bg-background focus-visible:ring-[3px] focus-visible:ring-accent-strong/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-transparent dark:disabled:border-transparent disabled:bg-surface-dark disabled:text-muted-foreground aria-invalid:border-destructive aria-invalid:bg-background aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
