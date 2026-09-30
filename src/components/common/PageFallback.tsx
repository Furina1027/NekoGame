import { Loader2 } from 'lucide-react';

export function PageFallback() {
  return (
    <div className="grid h-full place-items-center text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
    </div>
  );
}
