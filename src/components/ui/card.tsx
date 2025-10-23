import * as React from "react";

import { cn } from "./utils";

function Card({ className, style, ...props }: React.ComponentProps<"div">) {
  // Inline style fallback ensures the card is visible even if Tailwind classes
  // are not being applied correctly in the build.
  const fallbackStyle: React.CSSProperties = {
    backgroundColor: 'rgba(165, 218, 165, 0.81)',
    color: '#ffffff',
    padding: '1.5rem',
    borderRadius: '1.75rem',
    border: '1px solid rgba(0,0,0,0)',
    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.01)',
  };

  return (
    <div
      data-slot="card"
      // keep cn so any passed className still merges
      className={cn("bg-blue-500 text-white p-6 flex flex-col gap-6 rounded-xl border border-gray-200 shadow-lg", className)}
      // merge inline styles with the fallback (user-provided style overrides fallback)
      style={{ ...fallbackStyle, ...style }}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 pt-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, style, ...props }: React.ComponentProps<"div">) {

   const fallbackStyle: React.CSSProperties = {
    backgroundColor: 'rgba(78, 227, 52, 0.81)',
    color: '#rgba(255, 255, 255, 0.87)',
    padding: '1.5rem',
    borderRadius: '1.75rem',
    border: '1px solid rgba(0,0,0,0)',
    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.01)',
  };

  return (
    <h4
      data-slot="card-title"
      className={cn("leading-none", className)}
      style={{ ...fallbackStyle, ...style }}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <p
      data-slot="card-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className,
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6 last:pb-6", className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 pb-6 [.border-t]:pt-6", className)}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
};
