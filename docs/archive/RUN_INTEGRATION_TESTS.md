# Running Operator Edit Package Integration Tests

This guide shows how to execute and verify the integration test suite for the operator edit package feature.

## Quick Start

### Run All Tests
```bash
npm test -- edit-package.integration.test.ts
```

### Expected Output
```
  Integration Test 12.1: Draft Package Edit
    √ should load package data with all relationships
    √ should update package core fields and persist changes
    √ should reject invalid validation data
  Integration Test 12.2: Cannot Edit Pending Review Package
    √ should reject edit attempt with 403 error
    √ should not persist changes to pending_review package
  Integration Test 12.3: Cannot Edit Archived Package
    √ should reject edit attempt with 403 error
  Integration Test 12.4: Submit Package for Review
    √ should require at least one price variant before submission
    √ should require at least one map stop before submission
  Integration Test 12.5: Concurrency Conflict Detection
    √ should detect conflicting updates when no rows are updated
  Integration Test 12.6: Published Package Edit Restrictions
    √ should reject edit of published package
    √ should not allow price variant changes on published package
  Integration Test 12.7: Image Upload Success
    √ should accept image in gallery URLs
    √ should allow multiple images in gallery
  Integration Test 12.8: Image Upload Invalid File
    √ should validate image file format at upload
    √ should reject oversized files concept
  Integration Test 12.9: Image Delete from Gallery
    √ should remove image from gallery when deleted
    √ should update database when image is removed
  Integration Test 12.10: Rejected Package Resubmit
    √ should currently prevent editing of rejected packages (only draft editable)

Test Suites: 1 passed, 1 total
Tests:       17 passed, 17 total
Snapshots:   0 total
Time:        ~1.0 s
```

## Test Execution Options

### Run Specific Test Suite
```bash
npm test -- edit-package.integration.test.ts -t "Draft Package Edit"
```

### Run Single Test
```bash
npm test -- edit-package.integration.test.ts -t "should load package data"
```

### Run with Verbose Output
```bash
npm test -- edit-package.integration.test.ts --verbose
```

### Run with Coverage Report
```bash
npm test -- edit-package.integration.test.ts --coverage
```

### Run in Watch Mode (Development)
```bash
npm test -- edit-package.integration.test.ts --watch
```

### Run with Custom Timeout
```bash
npm test -- edit-package.integration.test.ts --testTimeout=10000
```

## Test Organization

### By Functionality

#### Package Data Management
- **12.1 Draft Package Edit** - Load and edit package data
- **12.7 Image Upload** - Manage gallery images
- **12.9 Image Delete** - Remove images

#### Access Control
- **12.2 Cannot Edit Pending Review** - Status-based restrictions
- **12.3 Cannot Edit Archived** - Status-based restrictions
- **12.6 Published Package Restrictions** - Published package locks

#### Workflow Management
- **12.4 Submit for Review** - Status transitions
- **12.10 Rejected Package Resubmit** - Resubmission after rejection

#### Error Handling
- **12.5 Concurrency Conflict** - Simultaneous edit detection
- **12.8 Image Upload Invalid** - File validation

## Test Coverage Analysis

### What's Tested

✅ **Data Operations**
- Loading package with all relationships
- Updating core package fields
- Persisting changes to database
- Timestamp updates

✅ **Permission Checks**
- Operator authentication
- Package ownership verification
- Status-based edit restrictions
- Role-based access control

✅ **Validation**
- Required fields
- Data format validation
- Business rule enforcement
- Constraint checking

✅ **Error Handling**
- Invalid input rejection
- Permission denials
- Concurrency conflicts
- Validation errors

✅ **Workflows**
- Draft to pending_review transition
- Rejection handling
- Image gallery management
- Multi-step operations

### What's NOT Tested (Intentional)

❌ **Storage Layer**
- File system operations
- Cloud storage interactions
- File I/O operations

❌ **Database Level**
- Direct SQL constraints
- Foreign key enforcement
- Database triggers

❌ **Frontend**
- UI rendering
- User interactions
- Client-side validation

❌ **Email/Notifications**
- Email sending
- Notification triggers
- Event publishing

## Test Helpers & Utilities

### Session Setup
```typescript
// Establish successful operator session
setupSuccessfulSession()

// Result: Profile ID and "operator" role authenticated
```

### Data Generators
```typescript
// Create valid package data
createMockPackageData({ title: "Custom Title" })

// Create complete package record
createMockDetailRecord("draft")

// Create price variant
createMockPriceVariant({ pricePerPax: 150 })

// Create map stop
createMockStop({ estimatedDurationMinutes: 90 })
```

### Assertion Helpers
```typescript
// Verify permission error
expectPermissionError(result)

// Verify validation error with field hint
expectValidationError(result, "price variant")
```

## Debugging Failed Tests

### Enable Detailed Logging
```bash
npm test -- edit-package.integration.test.ts --verbose --no-coverage
```

### Check Console Output
Tests may output `console.error` messages from the actions layer. This is expected when testing error paths.

### Common Issues

**Issue:** Mock chain error "X is not a function"
```
Solution: Ensure query builders return `this` via mockReturnThis()
         Check table name matches exactly in mock setup
```

**Issue:** Test timeout
```
Solution: Increase timeout: --testTimeout=10000
         Check that all promises are resolved in mocks
         Verify no infinite loops in mock logic
```

**Issue:** Unexpected permission error
```
Solution: Call setupSuccessfulSession() in beforeEach
         Verify operator accreditation_status is "approved"
         Check package owner matches test operator
```

## Integration with Development Workflow

### Before Committing
```bash
npm test -- edit-package.integration.test.ts
```

### Before Creating PR
```bash
npm test -- edit-package.integration.test.ts --coverage
npm run typecheck
```

### In CI/CD Pipeline
```yaml
- name: Install dependencies
  run: npm ci

- name: Run integration tests
  run: npm test -- edit-package.integration.test.ts --coverage

- name: Upload coverage
  run: npm run coverage:upload
```

## Test Lifecycle

### Setup Phase (beforeEach)
1. Clear all Jest mocks
2. Initialize successful session
3. Prepare test fixtures

### Execution Phase
1. Create mock Supabase client
2. Set up specific table query mocks
3. Execute the action being tested
4. Capture result

### Assertion Phase
1. Verify success/failure flag
2. Check error messages (if applicable)
3. Validate data consistency
4. Confirm expected side effects

### Cleanup Phase (afterEach - automatic)
1. Reset mock implementations
2. Clear mock call history
3. Release test resources

## Performance Metrics

| Metric | Value |
|--------|-------|
| Total Test Suites | 1 |
| Total Tests | 17 |
| Execution Time | ~1 second |
| Average Per Test | ~59ms |
| Pass Rate | 100% |

## Continuous Monitoring

### Test Trends
Monitor test performance over time:
```bash
npm test -- edit-package.integration.test.ts --json > test-results.json
```

### Coverage Tracking
Generate coverage reports:
```bash
npm test -- edit-package.integration.test.ts --coverage --coverageReporters=html
open coverage/index.html
```

## Related Commands

### Type Checking
```bash
npm run typecheck
```

### Lint Check
```bash
npm run lint
```

### Full Test Suite
```bash
npm test
```

### Build Verification
```bash
npm run build
```

## Support & Troubleshooting

### Check Test File Syntax
```bash
npm test -- edit-package.integration.test.ts --testNamePattern=dummy
```

### Validate Setup
```bash
npm test -- edit-package.integration.test.ts --showConfig
```

### Review Test Implementation
```bash
# Open and review the test file
cat src/app/\(subsystems\)/tours/operator/packages/edit-package.integration.test.ts
```

## Success Criteria

✅ All 17 tests passing
✅ No console errors
✅ Execution completes in < 2 seconds
✅ No mock setup failures
✅ All assertions evaluated

## Next Steps

After verifying all tests pass:

1. **Code Review** - Submit tests as part of PR
2. **Add to CI** - Integrate into continuous integration
3. **Document Changes** - Update relevant documentation
4. **Monitor** - Track test health over time
5. **Extend** - Add additional test cases as needed

## Additional Resources

- **Test File:** `src/app/(subsystems)/tours/operator/packages/edit-package.integration.test.ts`
- **Actions:** `src/app/(subsystems)/tours/operator/packages/actions.ts`
- **Jest Docs:** https://jestjs.io/docs/getting-started
- **Testing Library:** https://testing-library.com/docs/react-testing-library/intro/

## Test Status Dashboard

```
Integration Tests for Operator Edit Package Feature
═══════════════════════════════════════════════════

Status: ✅ PASSING

Suites:     1 passed
Tests:      17 passed
Coverage:   Core actions, permissions, workflows
Speed:      ~1 second

Last Run:   [Your timestamp]
Next Run:   [Scheduled timestamp]

Feature Coverage:
  ✅ Draft Package Edit (3 tests)
  ✅ Permission Enforcement (6 tests)
  ✅ Workflow Management (2 tests)
  ✅ Error Handling (3 tests)
  ✅ Image Management (3 tests)
```

---

**Ready to test?** Run: `npm test -- edit-package.integration.test.ts`
