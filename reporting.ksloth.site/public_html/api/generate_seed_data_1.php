<?php
/**
 * generate_seed_data.php
 * ONE-TIME script — run via CLI (`php generate_seed_data.php`), not
 * browser, since it can take a minute or two and CLI has no time limit
 * concerns. Delete or keep for re-runs; running it again just adds
 * another month of data on top (it doesn't clear existing rows).
 *
 * Generates ~30 days of realistic, correlated data for:
 * sessions, pageviews, performance, errors, events
 *
 * Deliberate signals baked in (for the report to discover):
 * - Load time scales with device profile (mobile slower) and IP region
 * - Bounce probability scales with load time + noise
 * - 2 incident days (elevated errors + slower load), 1 viral day, 1 quiet day
 * - js_allowed is always true (matches what the real collector can ever report)
 */

declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', '1');

// ADJUST to your actual server layout.
$config = require '/var/www/collector.ksloth.site/database/config.php';

$dsn = sprintf('mysql:host=%s;dbname=%s;charset=%s', $config['db_host'], $config['db_name'], $config['db_charset']);
$pdo = new PDO($dsn, $config['db_user'], $config['db_pass'], [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);

// ── Config ────────────────────────────────────────────────────────

$DAYS = 30;
$PAGES = ['/index.html', '/episodes.html', '/characters.html'];
$startDate = (new DateTime('today'))->modify("-{$DAYS} days");

$profiles = [
    ['weight' => 0.45, 'name' => 'desktop_chrome_win', 'ua' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36', 'viewports' => [[1920, 1080], [1366, 768], [1536, 864]], 'base' => 650],
    ['weight' => 0.12, 'name' => 'desktop_mac_safari', 'ua' => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15', 'viewports' => [[1440, 900], [1680, 1050]], 'base' => 700],
    ['weight' => 0.08, 'name' => 'desktop_firefox', 'ua' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0', 'viewports' => [[1920, 1080], [1366, 768]], 'base' => 750],
    ['weight' => 0.20, 'name' => 'mobile_iphone', 'ua' => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', 'viewports' => [[390, 844], [375, 812]], 'base' => 1400],
    ['weight' => 0.10, 'name' => 'mobile_android', 'ua' => 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36', 'viewports' => [[412, 915], [360, 800]], 'base' => 1550],
    ['weight' => 0.03, 'name' => 'bot_crawler', 'ua' => 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'viewports' => [[1024, 768]], 'base' => 150],
    ['weight' => 0.02, 'name' => 'legacy_browser', 'ua' => 'Mozilla/5.0 (Windows NT 6.1; Trident/7.0; rv:11.0) like Gecko', 'viewports' => [[1024, 768], [1280, 720]], 'base' => 1900],
];

$regions = [
    ['name' => 'us-west', 'prefix' => '73.', 'addon' => 0, 'weight' => 0.35],
    ['name' => 'us-east', 'prefix' => '98.', 'addon' => 60, 'weight' => 0.25],
    ['name' => 'europe', 'prefix' => '82.', 'addon' => 140, 'weight' => 0.20],
    ['name' => 'asia', 'prefix' => '103.', 'addon' => 260, 'weight' => 0.15],
    ['name' => 'other-intl', 'prefix' => '41.', 'addon' => 320, 'weight' => 0.05],
];

$referrers = [
    ['weight' => 0.30, 'v' => null],
    ['weight' => 0.28, 'v' => 'https://www.google.com/'],
    ['weight' => 0.12, 'v' => 'https://www.bing.com/'],
    ['weight' => 0.10, 'v' => 'https://www.facebook.com/'],
    ['weight' => 0.08, 'v' => 'https://twitter.com/'],
    ['weight' => 0.07, 'v' => 'https://www.reddit.com/'],
    ['weight' => 0.05, 'v' => 'https://duckduckgo.com/'],
];

$errorTemplates = [
    ['msg' => "TypeError: Cannot read properties of undefined (reading 'map')", 'source' => '/js/episodes.js', 'line' => 142, 'col' => 18],
    ['msg' => "TypeError: Cannot read properties of null (reading 'addEventListener')", 'source' => '/js/main.js', 'line' => 27, 'col' => 9],
    ['msg' => 'ReferenceError: renderCharacterCard is not defined', 'source' => '/js/characters.js', 'line' => 88, 'col' => 3],
    ['msg' => 'Resource failed to load: IMG', 'source' => '/images/character-thumb-14.jpg', 'line' => null, 'col' => null],
    ['msg' => 'Resource failed to load: SCRIPT', 'source' => '/js/analytics-vendor.js', 'line' => null, 'col' => null],
    ['msg' => 'promise-rejection: Failed to fetch', 'source' => null, 'line' => null, 'col' => null],
    ['msg' => "SyntaxError: Unexpected token '<'", 'source' => '/js/episodes.js', 'line' => 1, 'col' => 1],
    ['msg' => 'RangeError: Maximum call stack size exceeded', 'source' => '/js/characters.js', 'line' => 203, 'col' => 12],
];

// Pick 2 incident days, 1 viral day, 1 quiet day (all distinct, avoiding the edges)
$dayPool = range(2, $DAYS - 3);
shuffle($dayPool);
$incidentDays = array_slice($dayPool, 0, 2);
$viralDay = $dayPool[2];
$quietDay = $dayPool[3];

// ── Helpers ───────────────────────────────────────────────────────

function pickWeighted(array $items): array
{
    $r = mt_rand() / mt_getrandmax();
    $cum = 0;
    foreach ($items as $item) {
        $cum += $item['weight'];
        if ($r <= $cum) return $item;
    }
    return end($items);
}

function uuidv4(): string
{
    $data = random_bytes(16);
    $data[6] = chr(ord($data[6]) & 0x0f | 0x40);
    $data[8] = chr(ord($data[8]) & 0x3f | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}

function randIp(string $prefix): string
{
    return $prefix . mt_rand(0, 255) . '.' . mt_rand(0, 255) . '.' . mt_rand(1, 254);
}

function gaussianNoise(float $mean, float $stdev): float
{
    $u1 = max(mt_rand() / mt_getrandmax(), 1e-9);
    $u2 = mt_rand() / mt_getrandmax();
    $z = sqrt(-2 * log($u1)) * cos(2 * M_PI * $u2);
    return $mean + $z * $stdev;
}

function pickHourOfDay(): int
{
    $weights = [0=>1,1=>1,2=>1,3=>1,4=>1,5=>2,6=>3,7=>4,8=>5,9=>6,10=>7,11=>8,
                12=>9,13=>9,14=>8,15=>8,16=>8,17=>9,18=>10,19=>11,20=>11,21=>10,22=>6,23=>3];
    $total = array_sum($weights);
    $r = mt_rand(1, $total);
    $cum = 0;
    foreach ($weights as $hour => $w) {
        $cum += $w;
        if ($r <= $cum) return $hour;
    }
    return 12;
}

// ── Prepared statements ──────────────────────────────────────────

$sessionStmt = $pdo->prepare(
    "INSERT INTO sessions (session_id, first_page, last_page, page_count, start_time, last_activity, duration_seconds, referrer, user_agent)
     VALUES (:sid,:first,:last,:pc,:start,:last_act,:dur,:ref,:ua)"
);
$pvStmt = $pdo->prepare(
    "INSERT INTO pageviews (url, type, cookies_enabled, js_allowed, images_allowed, css_allowed, user_agent, viewport_width, viewport_height, referrer, client_timestamp, server_timestamp, client_ip, session_id, payload)
     VALUES (:url,'pageview',:cookies,:js,:images,:css,:ua,:vw,:vh,:ref,:cts,:sts,:ip,:sid,NULL)"
);
$perfStmt = $pdo->prepare(
    "INSERT INTO performance (session_id, url, ttfb, dom_content_loaded, dom_complete, load_time, server_timestamp)
     VALUES (:sid,:url,:ttfb,:dcl,:dc,:lt,:sts)"
);
$errStmt = $pdo->prepare(
    "INSERT INTO errors (session_id, error_message, error_source, error_line, error_column, stack_trace, url, user_agent, server_timestamp)
     VALUES (:sid,:msg,:src,:line,:col,:stack,:url,:ua,:sts)"
);
$evtStmt = $pdo->prepare(
    "INSERT INTO events (session_id, event_name, event_category, event_data, url, server_timestamp)
     VALUES (:sid,:name,:cat,:data,:url,:sts)"
);

// ── Generation ────────────────────────────────────────────────────

$pdo->beginTransaction();

$totals = ['sessions' => 0, 'pageviews' => 0, 'performance' => 0, 'errors' => 0, 'events' => 0];

for ($d = 0; $d < $DAYS; $d++) {
    $date = (clone $startDate)->modify("+{$d} days");
    $isIncident = in_array($d, $incidentDays, true);
    $isViral = ($d === $viralDay);
    $isQuiet = ($d === $quietDay);

    $baseSessions = mt_rand(15, 35);
    if ($isViral) $baseSessions = mt_rand(70, 110);
    if ($isQuiet) $baseSessions = mt_rand(3, 8);
    if ((int) $date->format('N') >= 6) $baseSessions = (int) ($baseSessions * 1.2); // weekend bump

    for ($s = 0; $s < $baseSessions; $s++) {
        $profile = pickWeighted($profiles);
        $viewport = $profile['viewports'][array_rand($profile['viewports'])];
        $region = pickWeighted($regions);
        $ip = randIp($region['prefix']);

        $cookiesEnabled = (mt_rand(1, 100) <= 92) ? 1 : 0;
        $jsAllowed = 1; // always true — matches what the real collector can ever report
        $imagesAllowed = (mt_rand(1, 100) <= 90) ? 1 : 0;
        $cssAllowed = (mt_rand(1, 100) <= 97) ? 1 : 0;

        $startTime = (clone $date)->setTime(pickHourOfDay(), mt_rand(0, 59), mt_rand(0, 59));
        $referrer = pickWeighted($referrers)['v'];

        $incidentMultiplier = $isIncident ? mt_rand(200, 400) / 100 : 1.0;
        $sessionLoadBase = ($profile['base'] + $region['addon']) * $incidentMultiplier;
        $hasOutlierSpike = (mt_rand(1, 100) <= 4);

        $loadFactor = $sessionLoadBase / 700;
        $bounceProb = 0.30 + min(max(($loadFactor - 1) * 0.18, -0.15), 0.45);
        $bounceProb += gaussianNoise(0, 0.05);
        $bounceProb = min(max($bounceProb, 0.05), 0.92);
        if ($profile['name'] === 'bot_crawler') $bounceProb = 0.95;

        $bounced = (mt_rand() / mt_getrandmax()) < $bounceProb;
        $pageCount = $bounced ? 1 : ((mt_rand(1, 100) <= 60) ? 2 : 3);

        $entryPage = ($referrer === null || mt_rand(1, 100) <= 70) ? $PAGES[0] : $PAGES[array_rand($PAGES)];
        $sequence = [$entryPage];
        $remaining = array_values(array_diff($PAGES, [$entryPage]));
        shuffle($remaining);
        for ($p = 1; $p < $pageCount; $p++) {
            $sequence[] = $remaining[$p - 1] ?? $PAGES[array_rand($PAGES)];
        }

        $sid = uuidv4();
        $ua = $profile['ua'];
        $currentTime = clone $startTime;

        foreach ($sequence as $idx => $url) {
            $lt = gaussianNoise($sessionLoadBase, $sessionLoadBase * 0.25);
            if ($hasOutlierSpike && $idx === 0) $lt += mt_rand(4000, 12000);
            $lt = max(80, (int) $lt);

            $ttfb = (int) ($lt * (mt_rand(20, 40) / 100));
            $dcl = (int) ($ttfb + ($lt - $ttfb) * (mt_rand(40, 65) / 100));
            $dc = (int) ($lt * (mt_rand(85, 98) / 100));

            $clientTsMs = $currentTime->getTimestamp() * 1000 + mt_rand(0, 999);
            $sts = $currentTime->format('Y-m-d H:i:s');

            $pvStmt->execute([
                ':url' => $url, ':cookies' => $cookiesEnabled, ':js' => $jsAllowed,
                ':images' => $imagesAllowed, ':css' => $cssAllowed, ':ua' => $ua,
                ':vw' => $viewport[0], ':vh' => $viewport[1],
                ':ref' => $idx === 0 ? ($referrer ?? '') : $sequence[$idx - 1],
                ':cts' => $clientTsMs, ':sts' => $sts, ':ip' => $ip, ':sid' => $sid,
            ]);
            $totals['pageviews']++;

            $perfStmt->execute([
                ':sid' => $sid, ':url' => $url, ':ttfb' => $ttfb, ':dcl' => $dcl,
                ':dc' => $dc, ':lt' => $lt, ':sts' => $sts,
            ]);
            $totals['performance']++;

            $errorChance = $isIncident ? mt_rand(18, 32) : mt_rand(2, 5);
            if ($profile['name'] === 'legacy_browser') $errorChance += 10;
            if (mt_rand(1, 100) <= $errorChance) {
                $tpl = $errorTemplates[array_rand($errorTemplates)];
                $errStmt->execute([
                    ':sid' => $sid, ':msg' => $tpl['msg'], ':src' => $tpl['source'],
                    ':line' => $tpl['line'], ':col' => $tpl['col'],
                    ':stack' => "at {$tpl['source']}:{$tpl['line']}:{$tpl['col']}\n    at HTMLDocument.<anonymous> ({$url})",
                    ':url' => $url, ':ua' => $ua, ':sts' => $sts,
                ]);
                $totals['errors']++;
            }

            // Activity events for this pageview
            $evtTime = clone $currentTime;
            $evtStmt->execute([':sid' => $sid, ':name' => 'lifecycle', ':cat' => 'lifecycle',
                ':data' => json_encode(['type' => 'lifecycle', 'state' => 'entered']),
                ':url' => $url, ':sts' => $evtTime->format('Y-m-d H:i:s')]);
            $totals['events']++;

            for ($m = 0, $n = mt_rand(2, 8); $m < $n; $m++) {
                $evtTime->modify('+' . mt_rand(1, 5) . ' seconds');
                $evtStmt->execute([':sid' => $sid, ':name' => 'mousemove', ':cat' => 'mouse',
                    ':data' => json_encode(['type' => 'mousemove', 'x' => mt_rand(0, $viewport[0]), 'y' => mt_rand(0, $viewport[1])]),
                    ':url' => $url, ':sts' => $evtTime->format('Y-m-d H:i:s')]);
                $totals['events']++;
            }

            $maxScrollY = 0;
            for ($sc = 0, $n = mt_rand(1, 6); $sc < $n; $sc++) {
                $evtTime->modify('+' . mt_rand(1, 8) . ' seconds');
                $maxScrollY = min(6000, $maxScrollY + mt_rand(200, 900));
                $evtStmt->execute([':sid' => $sid, ':name' => 'scroll', ':cat' => 'scroll',
                    ':data' => json_encode(['type' => 'scroll', 'x' => 0, 'y' => $maxScrollY]),
                    ':url' => $url, ':sts' => $evtTime->format('Y-m-d H:i:s')]);
                $totals['events']++;
            }

            if (mt_rand(1, 100) <= 40) {
                $evtTime->modify('+' . mt_rand(1, 10) . ' seconds');
                $evtStmt->execute([':sid' => $sid, ':name' => 'click', ':cat' => 'mouse',
                    ':data' => json_encode(['type' => 'click', 'button' => 'left', 'x' => mt_rand(0, $viewport[0]), 'y' => mt_rand(0, $viewport[1])]),
                    ':url' => $url, ':sts' => $evtTime->format('Y-m-d H:i:s')]);
                $totals['events']++;
            }

            if (mt_rand(1, 100) <= 8) {
                $idleDur = mt_rand(2000, 15000);
                $evtTime->modify('+' . (int) round($idleDur / 1000) . ' seconds');
                $evtStmt->execute([':sid' => $sid, ':name' => 'idle-break', ':cat' => 'idle',
                    ':data' => json_encode(['type' => 'idle-break', 'endedAt' => $evtTime->format(DateTime::ATOM), 'durationMs' => $idleDur]),
                    ':url' => $url, ':sts' => $evtTime->format('Y-m-d H:i:s')]);
                $totals['events']++;
            }

            $dwell = $bounced ? mt_rand(3, 45) : mt_rand(15, 240);
            $currentTime->modify('+' . $dwell . ' seconds');
        }

        $evtStmt->execute([':sid' => $sid, ':name' => 'lifecycle', ':cat' => 'lifecycle',
            ':data' => json_encode(['type' => 'lifecycle', 'state' => 'left']),
            ':url' => end($sequence), ':sts' => $currentTime->format('Y-m-d H:i:s')]);
        $totals['events']++;

        $sessionStmt->execute([
            ':sid' => $sid, ':first' => $entryPage, ':last' => end($sequence), ':pc' => $pageCount,
            ':start' => $startTime->format('Y-m-d H:i:s'), ':last_act' => $currentTime->format('Y-m-d H:i:s'),
            ':dur' => $currentTime->getTimestamp() - $startTime->getTimestamp(),
            ':ref' => $referrer, ':ua' => $ua,
        ]);
        $totals['sessions']++;
    }
}

$pdo->commit();

echo "Done.\n";
foreach ($totals as $table => $count) {
    echo str_pad($table, 12) . ": {$count}\n";
}
echo "\nIncident days (index into the {$DAYS}-day range): " . implode(', ', $incidentDays) . "\n";
echo "Viral day: {$viralDay}, Quiet day: {$quietDay}\n";
