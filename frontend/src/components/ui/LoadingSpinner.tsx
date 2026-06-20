import { cn } from '../../lib/utils';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_MAP = { sm: 16, md: 24, lg: 40 };

export default function LoadingSpinner({ size = 'md', className }: LoadingSpinnerProps) {
  const px = SIZE_MAP[size];
  return (
    <div
      className={cn('border-2 border-nexus-accent/20 border-t-nexus-accent rounded-full animate-spin', className)}
      style={{ width: px, height: px }}
    />
  );
}
