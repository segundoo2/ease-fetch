import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ApiClient from '../src/api-fetch';

describe('ApiClient - Logout Automático quando Token Expira', () => {
  let apiClient: ApiClient;
  let mockFetch: ReturnType<typeof vi.fn>;
  let originalLocation: Location;

  beforeEach(() => {
    // Mock do fetch
    mockFetch = vi.fn();
    global.fetch = mockFetch as typeof fetch;

    // Mock do window.location
    originalLocation = window.location as Location;
    delete (window as { location?: Location }).location;
    (window as { location: Partial<Location> }).location = {
      href: 'http://localhost:3000/pages/dashboard',
      assign: vi.fn(),
      replace: vi.fn(),
      reload: vi.fn(),
    } as unknown as Location;

    apiClient = new ApiClient({
      baseURL: 'http://localhost:3001',
      fetchImpl: mockFetch as typeof fetch,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    if (originalLocation) {
      (window as { location: Location }).location = originalLocation;
    }
  });

  describe('Quando recebe 401/403', () => {
    it('deve tentar refresh token automaticamente', async () => {
      // Primeira requisição retorna 401 (token expirado)
      mockFetch
        .mockResolvedValueOnce({
          status: 401,
          ok: false,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ message: 'Token expirado' }),
        })
        // Refresh token funciona
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true }),
        })
        // Retry da requisição original funciona
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ data: [] }),
        });

      const result = await apiClient.get('/users');

      // Deve ter feito 3 requisições: original, refresh, retry
      expect(mockFetch).toHaveBeenCalledTimes(3);
      
      // Deve ter chamado /auth/refresh
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/auth/refresh',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
        })
      );

      // Não deve ter redirecionado (refresh funcionou)
      expect(window.location.href).toBe('http://localhost:3000/pages/dashboard');
    });

    it('deve fazer logout e redirecionar quando refresh falha', async () => {
      // Primeira requisição retorna 401
      mockFetch
        .mockResolvedValueOnce({
          status: 401,
          ok: false,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ message: 'Token expirado' }),
        })
        // Refresh token falha (401)
        .mockResolvedValueOnce({
          status: 401,
          ok: false,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ message: 'Refresh token inválido' }),
        })
        // Logout é chamado
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          headers: new Headers(),
        });

      // A requisição deve falhar
      await expect(apiClient.get('/users')).rejects.toThrow();

      // Deve ter chamado /auth/refresh
      const refreshCalls = mockFetch.mock.calls.filter(
        (call) => call[0] === 'http://localhost:3001/auth/refresh'
      );
      expect(refreshCalls.length).toBeGreaterThanOrEqual(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/auth/refresh',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
        })
      );

      // Deve ter chamado /auth/logout
      const logoutCalls = mockFetch.mock.calls.filter(
        (call) => call[0] === 'http://localhost:3001/auth/logout'
      );
      expect(logoutCalls.length).toBeGreaterThanOrEqual(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/auth/logout',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
        })
      );

      // Deve ter redirecionado para login
      expect(window.location.href).toBe('/pages/login');
    });

    it('deve fazer logout mesmo se a chamada de logout falhar', async () => {
      // Primeira requisição retorna 401
      mockFetch
        .mockResolvedValueOnce({
          status: 401,
          ok: false,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ message: 'Token expirado' }),
        })
        // Refresh token falha
        .mockResolvedValueOnce({
          status: 401,
          ok: false,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ message: 'Refresh token inválido' }),
        })
        // Logout falha (mas não deve impedir redirecionamento)
        .mockRejectedValueOnce(new Error('Network error'));

      await expect(apiClient.get('/users')).rejects.toThrow();

      // Deve ter tentado fazer logout
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/auth/logout',
        expect.any(Object)
      );

      // Deve ter redirecionado mesmo com erro no logout
      expect(window.location.href).toBe('/pages/login');
    });
  });

  describe('Quando refresh está em andamento', () => {
    it('deve aguardar refresh em andamento antes de fazer nova tentativa', async () => {
      let resolveFirstRefresh: (value: Response) => void;
      const firstRefreshPromise = new Promise<Response>((resolve) => {
        resolveFirstRefresh = resolve;
      });

      // Primeira requisição retorna 401
      mockFetch
        .mockResolvedValueOnce({
          status: 401,
          ok: false,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ message: 'Token expirado' }),
        })
        // Primeira tentativa de refresh (lenta)
        .mockImplementationOnce(() => firstRefreshPromise)
        // Segunda requisição também retorna 401 (deve aguardar primeiro refresh)
        .mockResolvedValueOnce({
          status: 401,
          ok: false,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ message: 'Token expirado' }),
        })
        // Refresh bem-sucedido
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true }),
        })
        // Retries das requisições originais
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ data: [] }),
        })
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ data: [] }),
        });

      // Faz duas requisições simultâneas
      const promise1 = apiClient.get('/users');
      const promise2 = apiClient.get('/students');

      // Resolve o refresh
      resolveFirstRefresh!({
        status: 200,
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true }),
      } as Response);

      await Promise.all([promise1, promise2]);

      // Deve ter chamado refresh apenas uma vez (compartilhado)
      const refreshCalls = mockFetch.mock.calls.filter(
        (call) => call[0] === 'http://localhost:3001/auth/refresh'
      );
      expect(refreshCalls.length).toBe(1);
    });
  });

  describe('Endpoints de autenticação', () => {
    it('não deve tentar refresh para endpoints de login', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 401,
        ok: false,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ message: 'Credenciais inválidas' }),
      });

      await expect(
        apiClient.post('/auth/login', { email: 'test@test.com', password: '123' })
      ).rejects.toThrow();

      // Não deve ter chamado refresh
      const refreshCalls = mockFetch.mock.calls.filter(
        (call) => call[0] === 'http://localhost:3001/auth/refresh'
      );
      expect(refreshCalls.length).toBe(0);
    });

    it('não deve tentar refresh para endpoints de logout', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 401,
        ok: false,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ message: 'Não autorizado' }),
      });

      await expect(apiClient.post('/auth/logout')).rejects.toThrow();

      // Não deve ter chamado refresh
      const refreshCalls = mockFetch.mock.calls.filter(
        (call) => call[0] === 'http://localhost:3001/auth/refresh'
      );
      expect(refreshCalls.length).toBe(0);
    });
  });
});

