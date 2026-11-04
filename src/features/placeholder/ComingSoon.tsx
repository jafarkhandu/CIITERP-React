import { useParams } from 'react-router-dom';

interface Props {
  title: string;
  phase: 2 | 3 | 4;
}

/**
 * Temporary screen for modules that are not converted yet. The route, the
 * permission/role guard and the sidebar entry already work; replace the element in
 * src/routes/AppRoutes.tsx with the real component when its phase is done.
 */
export default function ComingSoon({ title, phase }: Props) {
  const params = useParams();
  const hasParams = Object.keys(params).length > 0;

  return (
    <div className="card border-0 shadow-sm">
      <div className="card-body">
        <h4 className="mb-1">{title}</h4>
        <p className="text-muted mb-0">This screen will be converted in Phase {phase}.</p>
        {hasParams && (
          <small className="text-muted">Route params: {JSON.stringify(params)}</small>
        )}
      </div>
    </div>
  );
}
