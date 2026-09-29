import {createElement as h, useEffect, useState} from 'react';
import {pageTitle, pathFor} from './shared.mjs';

function NestedControl() {
  const [count, setCount] = useState(0);
  return h('section', {id: 'nested-component'},
    h('button', {id: 'nested-action', type: 'button', onClick: () => setCount(count + 1)}, 'Nested action'),
    h('output', {id: 'nested-count'}, String(count)),
  );
}

export function ReactFixtureApp({initialRoute}) {
  const [page, setPage] = useState(initialRoute.page);
  const [premium, setPremium] = useState(false);
  const [late, setLate] = useState(false);
  const [renderCount, setRenderCount] = useState(0);
  const [input, setInput] = useState('native input');
  const [answer, setAnswer] = useState('');
  const [buttonKey, setButtonKey] = useState(0);
  const [clicks, setClicks] = useState(0);

  useEffect(() => {
    const onPopState = () => {
      const current = window.location.pathname.match(/-(a|b)(?:-[a-z0-9-]+)?$/)?.[1];
      if (current) setPage(current);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  function navigate(nextPage) {
    window.history.pushState({}, '', pathFor(initialRoute, nextPage));
    setPage(nextPage);
  }

  return h('main', {id: 'host-app'},
    h('h1', {id: 'page-title'}, pageTitle(page)),
    h('p', {id: 'editable-copy', style: {color: premium ? 'darkred' : 'navy'}},
      page === 'a' ? 'Alpha native copy' : 'Beta native copy'),
    h('p', {id: 'native-state'}, premium ? 'Premium' : 'Standard'),
    h('button', {id: 'go-a', type: 'button', onClick: () => navigate('a')}, 'Go to Alpha'),
    h('button', {id: 'go-b', type: 'button', onClick: () => navigate('b')}, 'Go to Beta'),
    h('button', {id: 'premium-toggle', type: 'button', 'aria-pressed': premium,
      onClick: () => setPremium(!premium)}, 'Toggle premium'),
    h('button', {id: 'late-toggle', type: 'button', onClick: () => setLate(!late)}, 'Toggle late child'),
    h('button', {id: 'rerender', type: 'button', onClick: () => setRenderCount(renderCount + 1)}, 'Rerender'),
    h('output', {id: 'render-count'}, String(renderCount)),
    h('label', {htmlFor: 'host-input'}, 'Host input'),
    h('input', {id: 'host-input', value: input, onChange: event => setInput(event.target.value)}),
    h('label', {htmlFor: 'state-input'}, 'Required value'),
    h('input', {id: 'state-input', value: answer, onChange: event => setAnswer(event.target.value)}),
    h('button', {id: 'state-button', key: buttonKey, disabled: !answer, type: 'button',
      style: {backgroundColor: premium ? 'rgb(0, 128, 0)' : 'rgb(128, 128, 128)'},
      onClick: () => setClicks(clicks + 1)}, answer ? 'Продолжить' : 'Ожидаем'),
    h('output', {id: 'state-clicks'}, String(clicks)),
    h('button', {id: 'remount-button', type: 'button', onClick: () => setButtonKey(buttonKey + 1)}, 'Remount button'),
    h(NestedControl),
    late ? h('p', {id: 'late-child'}, 'Late native child') : null,
  );
}
