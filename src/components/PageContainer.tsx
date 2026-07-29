import { LucideIcon } from 'lucide-react';
import { CommandPageHeader } from './Command';

interface PageContainerProps {
  children: React.ReactNode;
  title: string;
  icon: LucideIcon;
  description?: string;
  eyebrow?: string;
  actions?: React.ReactNode;
}

export function PageContainer({ 
  children, 
  title, 
  icon: Icon,
  description = 'Gerencie informações, prioridades e próximas ações desta área.',
  eyebrow,
  actions,
}: PageContainerProps) {
  return (
    <div className="command-page">
      <div className="responsive-page">
        <CommandPageHeader title={title} description={description} eyebrow={eyebrow} icon={Icon} actions={actions} />
        
        {children}
      </div>
    </div>
  );
}
