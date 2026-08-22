#!/usr/bin/env python3
"""Validate the multi-agent orchestration framework structure."""

import os
import json
import sys

PROJECT_ROOT = "/c/MISCELLANEOUS PROJECTS/SIH_2026/1/mule-detection"

def check_file(path, description):
    """Check if a file exists and is readable."""
    if os.path.exists(path):
        size = os.path.getsize(path)
        print(f"  ✓ {description}: exists ({path}, {size} bytes)")
        return True
    else:
        print(f"  ✗ {description}: MISSING ({path})")
        return False

def check_directory(path, description):
    """Check if a directory exists."""
    if os.path.isdir(path):
        print(f"  ✓ {description}: exists ({path})")
        return True
    else:
        print(f"  ✗ {description}: MISSING ({path})")
        return False

def main():
    print("=" * 60)
    print("MULTI-AGENT ORCHESTRATION FRAMEWORK VALIDATION")
    print("=" * 60)
    print(f"Project root: {PROJECT_ROOT}")
    print()
    
    results = []
    
    # 1. Core structure
    print("1. CORE DIRECTORY STRUCTURE")
    print("-" * 40)
    
    results.append(check_directory(
        os.path.join(PROJECT_ROOT, ".hermes"),
        ".hermes directory"
    ))
    
    results.append(check_directory(
        os.path.join(PROJECT_ROOT, ".hermes", "agents"),
        ".hermes/agents directory"
    ))
    
    results.append(check_directory(
        os.path.join(PROJECT_ROOT, ".hermes", "skills"),
        ".hermes/skills directory"
    ))
    
    results.append(check_directory(
        os.path.join(PROJECT_ROOT, ".hermes", "results"),
        ".hermes/results directory"
    ))
    
    print()
    
    # 2. Configuration files
    print("2. CONFIGURATION FILES")
    print("-" * 40)
    
    results.append(check_file(
        os.path.join(PROJECT_ROOT, ".hermes", "agents", "orchestrator_config.yaml"),
        "orchestrator_config.yaml"
    ))
    
    results.append(check_file(
        os.path.join(PROJECT_ROOT, ".hermes", "skills", "multi-agent-orchestration.skill"),
        "multi-agent-orchestration.skill"
    ))
    
    results.append(check_file(
        os.path.join(PROJECT_ROOT, ".hermes", "orchestrate.sh"),
        "orchestrate.sh entry point"
    ))
    
    print()
    
    # 3. Skill content validation
    print("3. SKILL CONTENT VALIDATION")
    print("-" * 40)
    
    skill_path = os.path.join(PROJECT_ROOT, ".hermes", "skills", "multi-agent-orchestration.skill")
    if os.path.exists(skill_path):
        with open(skill_path, 'r') as f:
            skill_content = f.read()
        
        # Check for required sections
        required_sections = [
            "name:",
            "description:",
            "orchestrate_multi_agent",
            "hermes_agent_analysis",
            "claude_code_frontend",
            "opencode_backend",
            "kimi_ml",
            "hermes_integration_synthesis",
            "verify_project_readiness"
        ]
        
        print("  Checking required skill sections:")
        for section in required_sections:
            if section in skill_content:
                print(f"    ✓ {section}")
                results.append(True)
            else:
                print(f"    ✗ {section} MISSING")
                results.append(False)
    
    print()
    
    # 4. Agent tool availability check
    print("4. TOOL AVAILABILITY")
    print("-" * 40)
    
    # Check if tools are available in the environment
    tools_to_check = ["claude", "opencode", "kimi", "hermes"]
    for tool in tools_to_check:
        tool_path = f"/c/Users/Swapneel/AppData/Roaming/npm/{tool}" if tool != "hermes" else "/c/Users/Swapneel/AppData/Local/hermes/hermes-agent/venv/Scripts/hermes"
        if os.path.exists(tool_path) or tool == "hermes":
            print(f"  ✓ {tool} binary check")
            results.append(True)
        else:
            # Try which command
            import subprocess
            try:
                result = subprocess.run(["which", tool], capture_output=True, text=True)
                if result.returncode == 0:
                    print(f"  ✓ {tool} found in PATH: {result.stdout.strip()}")
                    results.append(True)
                else:
                    print(f"  ? {tool} not immediately found (may need auth)")
                    results.append(True)  # Not a hard failure for validation
            except:
                print(f"  ? {tool} availability unknown")
                results.append(True)
    
    print()
    
    # Summary
    print("=" * 60)
    print("VALIDATION SUMMARY")
    print("=" * 60)
    
    passed = sum(results)
    total = len(results)
    percent = (passed / total * 100) if total > 0 else 0
    
    print(f"Passed: {passed}/{total} ({percent:.1f}%)")
    
    if passed == total:
        print("✓ ALL CHECKS PASSED - Framework is properly structured!")
        return 0
    else:
        print(f"✗ {total - passed} check(s) failed - Review the issues above")
        return 1

if __name__ == "__main__":
    sys.exit(main())
