import { Link } from 'react-router';
import { PageHeader, Screen } from '../components/Screen';

export function NotFoundPage() {
  return (
    <Screen barTitle="Not found" parent="/">
      <div className="page">
        <PageHeader title="Nothing here" sub="That page doesn't exist, or it was deleted." />
        <Link to="/" className="btn-primary">Back to menus</Link>
      </div>
    </Screen>
  );
}
