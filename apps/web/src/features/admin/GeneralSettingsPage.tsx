import { PageHeader } from '../../components/ui';
import { BackLink, MenuGroup } from './shared';

export function GeneralSettingsPage() {
  return (
    <>
      <BackLink to="/settings" label="Settings" />
      <PageHeader title="General settings" />
      <div className="admin-grid">
        <MenuGroup
          title="Setup"
          links={[
            { to: '/settings/general/taxes', title: 'Taxes', subtitle: 'Manage GST, CGST, SGST and other rates' },
            { to: '/catalog', title: 'Catalog', subtitle: 'Products, statuses, and warranty periods' },
          ]}
        />
      </div>
    </>
  );
}
