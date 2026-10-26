<?php
// Assistance de bord : relaie la conversation vers l'API Anthropic.
// Le system prompt (system-prompt.txt) et la clé restent sur le serveur ; le navigateur n'envoie que la conversation.
require __DIR__ . '/_lib.php';
sb_cors();

$cfg = sb_config();
$key = $cfg['anthropic_key'] ?? '';
if ($key === '') sb_json(503, ['error' => 'not_configured']);

// Anti-abus : par visiteur, et plafond global quotidien (filet de sécurité en plus du plafond de la console Anthropic)
$ip = md5(sb_ip() . 'starbyte');
if (!sb_rate('chat_' . $ip, (int)($cfg['per_hour'] ?? 30), 3600)) sb_json(429, ['error' => 'rate_limit']);
if (!sb_rate('chat_all', (int)($cfg['per_day'] ?? 2000), 86400)) sb_json(429, ['error' => 'busy']);

$in = sb_body();
$msgs = [];
foreach (array_slice($in['messages'] ?? [], -8) as $m) {
    $role = ($m['role'] ?? '') === 'assistant' ? 'assistant' : 'user';
    $text = sb_clean((string)($m['content'] ?? ''), $role === 'user' ? 800 : 1500);
    if ($text === '') continue;
    // fusionne deux messages consécutifs du même rôle (l'API exige l'alternance)
    if ($msgs && end($msgs)['role'] === $role) { $msgs[count($msgs) - 1]['content'] .= "\n" . $text; continue; }
    $msgs[] = ['role' => $role, 'content' => $text];
}
while ($msgs && $msgs[0]['role'] !== 'user') array_shift($msgs);
if (!$msgs || end($msgs)['role'] !== 'user') sb_json(400, ['error' => 'no_question']);

$system = @file_get_contents(__DIR__ . '/system-prompt.txt');
if (!$system) sb_json(503, ['error' => 'not_configured']);

// Depuis le jeu : un court état de la partie, passé à part (jamais mêlé à la question du joueur)
$sys = [['type' => 'text', 'text' => $system, 'cache_control' => ['type' => 'ephemeral']]];
$ctx = sb_clean((string)($in['context'] ?? ''), 400);
if ($ctx !== '') $sys[] = ['type' => 'text', 'text' => "PARTIE DU JOUEUR (état envoyé par le jeu, à utiliser pour répondre sur sa partie, sans le recopier) : " . $ctx];

$payload = [
    'model' => $cfg['model'] ?? 'claude-haiku-5-5',
    'max_tokens' => 450,
    'system' => $sys,
    'messages' => $msgs,
];

$ch = curl_init($cfg['api_url'] ?? 'https://api.anthropic.com/v1/messages');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 40,
    CURLOPT_CONNECTTIMEOUT => 8,
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
        'x-api-key: ' . $key,
        'anthropic-version: 2023-06-01',
        'content-type: application/json',
    ],
    CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
]);
$res = curl_exec($ch);
$code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
$cerr = curl_error($ch);
curl_close($ch);

$data = is_string($res) ? json_decode($res, true) : null;
if ($code !== 200 || !is_array($data)) {
    $type = $data['error']['type'] ?? ($cerr ?: 'unknown');
    sb_log("chat api_error http=$code type=$type");
    sb_json(502, ['error' => 'upstream']);
}
$text = '';
foreach ($data['content'] ?? [] as $b) if (($b['type'] ?? '') === 'text') $text .= $b['text'];
$text = trim($text);
if ($text === '') { sb_log('chat empty stop=' . ($data['stop_reason'] ?? '?') . ' ctx=' . ($ctx !== '' ? 1 : 0)); sb_json(502, ['error' => 'empty']); }

sb_json(200, ['reply' => $text]);
