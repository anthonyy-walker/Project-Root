# Quick Start - Open Kibana and Display Ready-to-Use Queries
# This script opens Kibana and shows you exactly what to do

$kibanaUrl = "http://159.89.229.112:5601"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   KIBANA DASHBOARD QUICK START" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan

Write-Host "`nOpening Kibana in your browser..." -ForegroundColor Yellow
Start-Process $kibanaUrl

Write-Host "`n📊 STEP-BY-STEP DASHBOARD CREATION" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan

Write-Host "`n1️⃣  CREATE CCU MONITOR DASHBOARD" -ForegroundColor Yellow
Write-Host "   In Kibana:" -ForegroundColor White
Write-Host "   a. Click 'Analytics' > 'Dashboard' > 'Create dashboard'" -ForegroundColor Gray
Write-Host "   b. Click 'Create visualization'" -ForegroundColor Gray
Write-Host "   c. Select 'Concurrent Users' data view" -ForegroundColor Gray
Write-Host "   d. Configure:" -ForegroundColor Gray
Write-Host "      - Horizontal axis: timestamp" -ForegroundColor Gray
Write-Host "      - Vertical axis: Sum of ccu" -ForegroundColor Gray
Write-Host "      - Break down by: Top 10 map_id.keyword" -ForegroundColor Gray
Write-Host "   e. Click 'Save and return'" -ForegroundColor Gray
Write-Host "   f. Save dashboard as 'CCU Monitor'" -ForegroundColor Gray

Write-Host "`n2️⃣  CREATE DISCOVERY TRACKER" -ForegroundColor Yellow
Write-Host "   In Kibana:" -ForegroundColor White
Write-Host "   a. Create new dashboard" -ForegroundColor Gray
Write-Host "   b. Add visualization > Table" -ForegroundColor Gray
Write-Host "   c. Select 'Discovery Current' data view" -ForegroundColor Gray
Write-Host "   d. Add rows:" -ForegroundColor Gray
Write-Host "      - map_id.keyword" -ForegroundColor Gray
Write-Host "      - panel.keyword" -ForegroundColor Gray
Write-Host "      - position" -ForegroundColor Gray
Write-Host "   e. Sort by position (ascending)" -ForegroundColor Gray
Write-Host "   f. Save as 'Discovery Tracker'" -ForegroundColor Gray

Write-Host "`n3️⃣  USEFUL KQL QUERIES (Copy & Paste in Search Bar)" -ForegroundColor Yellow
Write-Host "   ----------------------------------------" -ForegroundColor Gray

Write-Host "`n   📈 High CCU Maps:" -ForegroundColor Cyan
Write-Host "   ccu > 100" -ForegroundColor White

Write-Host "`n   🎮 Specific Map Changes:" -ForegroundColor Cyan
Write-Host "   map_id: `"6773-8510-0680`"" -ForegroundColor White

Write-Host "`n   🔍 TMNT Collaboration:" -ForegroundColor Cyan
Write-Host "   surface: *TMNT*" -ForegroundColor White

Write-Host "`n   ⭐ Top Panels:" -ForegroundColor Cyan
Write-Host "   panel: `"Browse_Cluster_Horror`"" -ForegroundColor White

Write-Host "`n   🆕 Recent Changes (last hour):" -ForegroundColor Cyan
Write-Host "   timestamp > now-1h" -ForegroundColor White

Write-Host "`n   📍 Specific Region:" -ForegroundColor Cyan
Write-Host "   region: `"NAE`"" -ForegroundColor White

Write-Host "`n4️⃣  QUICK METRICS TO ADD" -ForegroundColor Yellow
Write-Host "   ----------------------------------------" -ForegroundColor Gray
Write-Host "   • Total Maps: Unique count of map_id.keyword (Maps data view)" -ForegroundColor White
Write-Host "   • Total Creators: Unique count (Creators data view)" -ForegroundColor White
Write-Host "   • Current CCU: Sum of ccu, last 10 min (Concurrent Users)" -ForegroundColor White
Write-Host "   • Featured Maps: Count (Discovery Current data view)" -ForegroundColor White

Write-Host "`n5️⃣  ENABLE AUTO-REFRESH" -ForegroundColor Yellow
Write-Host "   ----------------------------------------" -ForegroundColor Gray
Write-Host "   • Click time picker (top right)" -ForegroundColor White
Write-Host "   • Toggle 'Refresh every' to ON" -ForegroundColor White
Write-Host "   • Set to 30 seconds for real-time monitoring" -ForegroundColor White

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Kibana should now be open in your browser!" -ForegroundColor Green
Write-Host "Follow the steps above to create dashboards" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan

Write-Host "`n📖 For detailed instructions, see:" -ForegroundColor Yellow
Write-Host "   kibana\DASHBOARD_GUIDE.md" -ForegroundColor White

Write-Host "`n⌨️  Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
