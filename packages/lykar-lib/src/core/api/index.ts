import { ApiClient } from './requester';

export const api = new ApiClient({
  baseUrl: 'http://localhost:3000/api',
  // TODO ПОТОМ ЗАМЕНИТЬ
  getToken: () => localStorage.getItem('editor_jwt'),
});