import { h, render} from 'preact';
import { PageEditor } from './components/page-editor/page-editor';
import '~/styles/sidebar.css';

export function init(config: any) {
  const root = document.createElement('div');
  root.id = 'editor-root';
  document.body.appendChild(root);

  render(<PageEditor config={config}/>, root);
}