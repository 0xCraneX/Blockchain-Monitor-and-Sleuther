#!/bin/bash

# Demo script for log monitoring tools

echo "==================================="
echo "Log Monitoring Demo"
echo "==================================="
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}Available monitoring commands:${NC}"
echo ""

echo -e "${GREEN}1. Basic monitoring:${NC}"
echo "   node scripts/monitor-logs-enhanced.js"
echo ""

echo -e "${GREEN}2. Monitor errors only:${NC}"
echo "   node scripts/monitor-logs-enhanced.js -l ERROR"
echo ""

echo -e "${GREEN}3. Monitor GraphController:${NC}"
echo "   node scripts/monitor-logs-enhanced.js -c GraphController"
echo ""

echo -e "${GREEN}4. Monitor database queries:${NC}"
echo "   node scripts/monitor-logs-enhanced.js -p DATABASE_QUERY"
echo ""

echo -e "${GREEN}5. Track request flows:${NC}"
echo "   node scripts/monitor-logs-enhanced.js -r"
echo ""

echo -e "${GREEN}6. Show statistics dashboard:${NC}"
echo "   node scripts/monitor-logs-enhanced.js -s"
echo ""

echo -e "${GREEN}7. Save important logs for analysis:${NC}"
echo "   node scripts/monitor-logs-enhanced.js --save -l WARN"
echo ""

echo -e "${GREEN}8. Analyze saved logs:${NC}"
echo "   node scripts/analyze-logs.js"
echo ""

echo -e "${YELLOW}Which command would you like to run? (1-8) or 'q' to quit:${NC}"
read -r choice

case $choice in
    1)
        echo -e "${BLUE}Starting basic log monitoring...${NC}"
        node scripts/monitor-logs-enhanced.js
        ;;
    2)
        echo -e "${BLUE}Monitoring errors only...${NC}"
        node scripts/monitor-logs-enhanced.js -l ERROR
        ;;
    3)
        echo -e "${BLUE}Monitoring GraphController...${NC}"
        node scripts/monitor-logs-enhanced.js -c GraphController
        ;;
    4)
        echo -e "${BLUE}Monitoring database queries...${NC}"
        node scripts/monitor-logs-enhanced.js -p DATABASE_QUERY
        ;;
    5)
        echo -e "${BLUE}Tracking request flows...${NC}"
        node scripts/monitor-logs-enhanced.js -r
        ;;
    6)
        echo -e "${BLUE}Showing statistics dashboard...${NC}"
        node scripts/monitor-logs-enhanced.js -s
        ;;
    7)
        echo -e "${BLUE}Saving important logs...${NC}"
        node scripts/monitor-logs-enhanced.js --save -l WARN
        ;;
    8)
        echo -e "${BLUE}Analyzing saved logs...${NC}"
        node scripts/analyze-logs.js
        ;;
    q|Q)
        echo -e "${GREEN}Exiting...${NC}"
        exit 0
        ;;
    *)
        echo -e "${YELLOW}Invalid choice. Please run the script again.${NC}"
        exit 1
        ;;
esac