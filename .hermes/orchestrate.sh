#!/bin/bash
# Main orchestration entry point for multi-agent workflow
# Usage: hermes chat -q ".hermes/orchestrate.sh 'mission statement'"

PROJECT_ROOT="${2:-$(pwd)}"
MISSION="${3:-'Improve mule-detection project with multi-agent AI orchestration'}"
ITERATIONS="${4:-3}"

echo "=== Multi-Agent Orchestration Framework ==="
echo "Project: $PROJECT_ROOT"
echo "Mission: $MISSION"
echo "Iterations: $ITERATIONS"
echo ""

# Load the skill's orchestrate function
source <(grep -A 200 "orchestrate_multi_agent" ".hermes/skills/multi-agent-orchestration.skill" | head -100)

# Run the main orchestration
main "$PROJECT_ROOT" "$MISSION" "$ITERATIONS"
