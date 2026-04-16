#!/usr/bin/env python3
import subprocess
import sys

# Run the test
result = subprocess.run(
    ['npm', 'test', '--', 'server/__tests__/phase-5-load-existing-flow.test.js'],
    cwd='C:\\source\\SOLON',
    capture_output=True,
    text=True,
    timeout=120
)

# Print the last 1000 lines of output
lines = result.stdout.split('\n')
print('\n'.join(lines[-1000:]))

# Also print stderr if there's anything
if result.stderr:
    print('\n=== STDERR ===')
    print(result.stderr[-500:])

sys.exit(result.returncode)
