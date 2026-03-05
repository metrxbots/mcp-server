# Testing Guide for MCP Server

## Quick Start

### Run All Tests
```bash
npx vitest run src/__tests__/
```

### Run Tests in Watch Mode
```bash
npx vitest src/__tests__/
```

### Run Specific Test File
```bash
npx vitest run src/__tests__/api-client.test.ts
```

### Run Tests with Coverage
```bash
npx vitest run --coverage src/__tests__/
```

---

## Test Structure

Tests are organized by component:

```
src/__tests__/
├── api-client.test.ts          # MetrxApiClient initialization, HTTP methods
├── tools-dashboard.test.ts     # get_cost_summary, list_agents, get_agent_detail
├── tools-optimization.test.ts  # get_optimization_recommendations, apply_optimization
├── tools-budgets-alerts.test.ts # budgets, alerts, predictions
├── tools-experiments-leaks.test.ts # experiments, cost leak detector
└── server-integration.test.ts  # Environment, initialization, integration
```

---

## What Each Test File Covers

### API Client Tests
**File:** `src/__tests__/api-client.test.ts` (24 tests)

Tests the core API communication layer:
- Initialization with API key (environment or constructor)
- GET requests with query parameters
- POST requests with JSON bodies
- PATCH requests for updates
- Error handling (4xx, 5xx, network)
- Response parsing (wrapped and unwrapped)
- Authentication header inclusion

**Example Test:**
```typescript
it('should make authenticated GET request', async () => {
  const client = new MetrxApiClient('sk_test_key');

  // Verify Authorization header is included
  expect(client.get('/agents')).toBeCalled();
  expect(headers).toContain('Bearer sk_test_key');
});
```

---

### Dashboard Tools Tests
**File:** `src/__tests__/tools-dashboard.test.ts` (24 tests)

Tests three read-only tools for cost analysis:
- `get_cost_summary` - Org-wide cost overview
- `list_agents` - Agent enumeration with filtering
- `get_agent_detail` - Individual agent analysis

Tests validate:
- Tool registration with correct metadata
- Default parameter values (period_days=30)
- Optional filtering (status, category)
- Error handling and formatting

**Example Test:**
```typescript
it('should filter agents by status', async () => {
  const handler = getToolHandler('list_agents');
  const result = await handler({ status: 'active' });

  expect(client.get).toHaveBeenCalledWith(
    '/agents',
    expect.objectContaining({ status: 'active' })
  );
});
```

---

### Optimization Tools Tests
**File:** `src/__tests__/tools-optimization.test.ts` (23 tests)

Tests two tools for cost optimization:
- `get_optimization_recommendations` - AI suggestions (read-only)
- `apply_optimization` - One-click fixes (write)

Tests validate:
- Fleet vs. agent-specific analysis routing
- Revenue insight toggle
- Custom payload handling
- Write operation annotations

**Example Test:**
```typescript
it('should route to /dashboard for fleet recommendations', async () => {
  const handler = getToolHandler('get_optimization_recommendations');
  await handler({ include_revenue: true });

  expect(client.get).toHaveBeenCalledWith('/dashboard', expect.any(Object));
});
```

---

### Budget & Alert Tools Tests
**File:** `src/__tests__/tools-budgets-alerts.test.ts` (37 tests)

Tests five tools for spending and monitoring:
- `get_budget_status` - Budget overview
- `set_budget` - Create/update budgets (write)
- `get_alerts` - Alert retrieval with filtering
- `acknowledge_alert` - Batch mark-as-read (write)
- `get_failure_predictions` - Risk analysis

Tests validate:
- Currency conversion ($ → microcents)
- Budget enforcement modes
- Alert severity filtering
- Batch operations

**Example Test:**
```typescript
it('should convert dollars to microcents', async () => {
  const handler = getToolHandler('set_budget');
  await handler({ limit_dollars: 100 });

  // 100 * 100,000,000 = 10,000,000,000 microcents
  expect(client.post).toHaveBeenCalledWith(
    '/budgets',
    expect.objectContaining({ limit_microcents: 10000000000 })
  );
});
```

---

### Experiment & Cost Leak Tests
**File:** `src/__tests__/tools-experiments-leaks.test.ts` (32 tests)

Tests three tools for A/B testing and cost auditing:
- `create_model_experiment` - Start A/B test (write, non-idempotent)
- `get_experiment_results` - Check progress
- `run_cost_leak_scan` - Cost efficiency audit

Tests validate:
- Parameter defaults (traffic_pct=10%, duration=14 days)
- Metric enum validation
- Fleet vs. agent-specific scans
- Health score calculation

**Example Test:**
```typescript
it('should default traffic_pct to 10%', async () => {
  const handler = getToolHandler('create_model_experiment');
  await handler({
    agent_id: 'agent_123',
    name: 'Test',
    treatment_model: 'gpt-4o-mini',
  });

  expect(client.post).toHaveBeenCalledWith(
    '/experiments',
    expect.objectContaining({ traffic_pct: 10 })
  );
});
```

---

### Server Integration Tests
**File:** `src/__tests__/server-integration.test.ts` (32 tests)

Tests the complete MCP server initialization:
- Environment variable reading (METRX_API_KEY, METRX_API_URL)
- API client initialization
- Tool domain imports
- HTTP header management
- Error handling

Tests validate:
- Fails gracefully without API key
- Uses correct default API URL
- All tools are importable
- Proper headers are sent

**Example Test:**
```typescript
it('should require METRX_API_KEY', () => {
  delete process.env.METRX_API_KEY;

  expect(() => new MetrxApiClient()).toThrow(
    'METRX_API_KEY is required'
  );
});
```

---

## Writing New Tests

### Test Template for Tools

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerMyTools } from '../../dist/tools/my-tool';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import type { MetrxApiClient } from '../../dist/services/api-client';

const createMockServer = () => ({ registerTool: vi.fn() });
const createMockClient = (): Partial<MetrxApiClient> => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
});

describe('My Tool', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockClient: Partial<MetrxApiClient>;

  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
  });

  it('should register the tool', () => {
    registerMyTools(mockServer as any, mockClient as any);

    expect(mockServer.registerTool).toHaveBeenCalledWith(
      'my_tool',
      expect.objectContaining({
        title: 'My Tool',
      }),
      expect.any(Function)
    );
  });

  it('should call API with correct parameters', async () => {
    registerMyTools(mockServer as any, mockClient as any);
    const calls = (mockServer.registerTool as any).mock.calls;
    const toolCall = calls.find(([name]: [string]) => name === 'my_tool');
    const handler = toolCall[2];

    (mockClient.get as any).mockResolvedValueOnce({
      data: { /* mock response */ }
    });

    await handler({ /* tool inputs */ });

    expect(mockClient.get).toHaveBeenCalledWith(
      '/expected/path',
      expect.objectContaining({ /* expected params */ })
    );
  });
});
```

### Best Practices

1. **Use descriptive test names**
   ```typescript
   ✓ it('should validate period_days between 1 and 90')
   ✗ it('validates period')
   ```

2. **Test both success and error cases**
   ```typescript
   it('should return formatted summary on success', ...)
   it('should return error when API fails', ...)
   ```

3. **Verify exact API calls**
   ```typescript
   expect(client.get).toHaveBeenCalledWith(
     '/specific/path',
     expect.objectContaining({ expected: 'params' })
   );
   ```

4. **Test parameter defaults**
   ```typescript
   it('should use default period_days of 30 when not provided', ...)
   ```

5. **Test boundary conditions**
   ```typescript
   it('should accept period_days=1 (minimum)', ...)
   it('should accept period_days=90 (maximum)', ...)
   ```

---

## Debugging Tests

### Run a Single Test
```bash
npx vitest run src/__tests__/api-client.test.ts -t "should make authenticated"
```

### Run Tests Matching a Pattern
```bash
npx vitest run --grep "budget"
```

### Enable Debug Output
```bash
DEBUG=* npx vitest run src/__tests__/
```

### Use console.log in Tests
```typescript
it('should test something', () => {
  const result = handler({ /* params */ });
  console.log('Result:', result); // Will show in output
  expect(result).toBeDefined();
});
```

---

## Common Issues & Solutions

### Issue: "Cannot read properties of undefined"
**Cause:** Mock response is missing required fields
**Solution:** Provide complete mock response with all required fields

```typescript
// ❌ Incomplete
(mockClient.get as any).mockResolvedValueOnce({ data: {} });

// ✓ Complete
(mockClient.get as any).mockResolvedValueOnce({
  data: {
    agents: { total: 5, active: 4 },
    cost: { total_calls: 100, total_cost_cents: 5000 },
  }
});
```

### Issue: "expected spy to be called with..."
**Cause:** Mock wasn't called with expected parameters
**Solution:** Verify API call matches actual implementation

```typescript
// Check what was actually called
const callArgs = (mockClient.get as any).mock.calls[0];
console.log('Actual:', callArgs);
```

### Issue: Tests fail after updating source
**Cause:** Need to rebuild compiled files
**Solution:** Rebuild before running tests

```bash
npm run build
npx vitest run src/__tests__/
```

---

## CI/CD Integration

### Adding to CI Pipeline
```yaml
# Example GitHub Actions
- name: Run tests
  run: |
    npm test
```

### Pre-commit Hook
```bash
# Install husky if not already done
npm install husky --save-dev

# Add pre-commit hook
npx husky add .husky/pre-commit "npm test"
```

---

## Performance

### Test Execution Time
- Full suite: ~1.2 seconds
- By file: 8-56ms each

### Optimize Slow Tests
1. Avoid real API calls (use mocks)
2. Reduce data volume in test fixtures
3. Use `beforeEach` to avoid redundant setup

---

## Coverage Goals

Current coverage:
- **API Client**: 100% (all methods tested)
- **Tool Registration**: 100% (all tools registered)
- **Handler Logic**: 85%+ (happy path + error cases)
- **Error Handling**: 100% (all error scenarios)

Target: Maintain >90% coverage

---

## Useful Commands

| Command | Purpose |
|---------|---------|
| `npx vitest run` | Run all tests once |
| `npx vitest` | Run tests in watch mode |
| `npx vitest --coverage` | Generate coverage report |
| `npx vitest --reporter=verbose` | Detailed output |
| `npx vitest --grep="budget"` | Run matching tests |

---

## References

- [Vitest Documentation](https://vitest.dev/)
- [MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [API Types](../../dist/types.d.ts)
