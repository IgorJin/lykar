import {h, onMounted, onUnmounted, ref} from 'vue';
import {pageTitle, pathFor} from './shared.mjs';

const NestedControl = {
  setup() {
    const count = ref(0);
    return () => h('section', {id: 'nested-component'}, [
      h('button', {id: 'nested-action', type: 'button', onClick: () => count.value++}, 'Nested action'),
      h('output', {id: 'nested-count'}, String(count.value)),
    ]);
  },
};

export function makeVueFixtureApp(initialRoute) {
  return {
    setup() {
      const page = ref(initialRoute.page);
      const premium = ref(false);
      const late = ref(false);
      const renderCount = ref(0);
      const input = ref('native input');
      const answer = ref('');
      const buttonKey = ref(0);
      const clicks = ref(0);
      const onPopState = () => {
        const current = window.location.pathname.match(/-(a|b)(?:-[a-z0-9-]+)?$/)?.[1];
        if (current) page.value = current;
      };
      onMounted(() => window.addEventListener('popstate', onPopState));
      onUnmounted(() => window.removeEventListener('popstate', onPopState));
      const navigate = nextPage => {
        window.history.pushState({}, '', pathFor(initialRoute, nextPage));
        page.value = nextPage;
      };
      return () => h('main', {id: 'host-app'}, [
        h('h1', {id: 'page-title'}, pageTitle(page.value)),
        h('p', {id: 'editable-copy', style: {color: premium.value ? 'darkred' : 'navy'}},
          page.value === 'a' ? 'Alpha native copy' : 'Beta native copy'),
        h('p', {id: 'native-state'}, premium.value ? 'Premium' : 'Standard'),
        h('button', {id: 'go-a', type: 'button', onClick: () => navigate('a')}, 'Go to Alpha'),
        h('button', {id: 'go-b', type: 'button', onClick: () => navigate('b')}, 'Go to Beta'),
        h('button', {id: 'premium-toggle', type: 'button', 'aria-pressed': premium.value,
          onClick: () => premium.value = !premium.value}, 'Toggle premium'),
        h('button', {id: 'late-toggle', type: 'button', onClick: () => late.value = !late.value}, 'Toggle late child'),
        h('button', {id: 'rerender', type: 'button', onClick: () => renderCount.value++}, 'Rerender'),
        h('output', {id: 'render-count'}, String(renderCount.value)),
        h('label', {for: 'host-input'}, 'Host input'),
        h('input', {id: 'host-input', value: input.value, onInput: event => input.value = event.target.value}),
        h('label', {for: 'state-input'}, 'Required value'),
        h('input', {id: 'state-input', value: answer.value, onInput: event => answer.value = event.target.value}),
        h('button', {id: 'state-button', key: buttonKey.value, disabled: !answer.value, type: 'button',
          style: {backgroundColor: premium.value ? 'rgb(0, 128, 0)' : 'rgb(128, 128, 128)'},
          onClick: () => clicks.value++}, answer.value ? 'Продолжить' : 'Ожидаем'),
        h('output', {id: 'state-clicks'}, String(clicks.value)),
        h('button', {id: 'remount-button', type: 'button', onClick: () => buttonKey.value++}, 'Remount button'),
        h(NestedControl),
        late.value ? h('p', {id: 'late-child'}, 'Late native child') : null,
      ]);
    },
  };
}
