import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App, ConfigurationError } from './App';
import { createPortalApi } from './api';
import { loadPortalConfig } from './config';
import './styles.css';

const root = createRoot(document.getElementById('root')!);

try {
	const api = createPortalApi(loadPortalConfig());
	root.render(
		<StrictMode>
			<App api={api} />
		</StrictMode>
	);
} catch (error) {
	root.render(<ConfigurationError message={error instanceof Error ? error.message : 'VITE_API_BASE_URL is invalid'} />);
}
