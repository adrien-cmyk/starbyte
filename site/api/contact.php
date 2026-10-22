<?php
// Formulaire « Signaler un problème » : envoie le message à empire@starbyte.online.
// Le visiteur n'obtient « envoyé » que si mail() a accepté le message.
require __DIR__ . '/_lib.php';
sb_cors();

$ip = md5(sb_ip() . 'starbyte');
if (!sb_rate('contact_' . $ip, 5, 3600)) sb_json(429, ['error' => 'rate_limit']);
if (!sb_rate('contact_all', 200, 86400)) sb_json(429, ['error' => 'busy']);

$in = sb_body(4500000);
if (!empty($in['site'])) sb_json(200, ['ok' => true]); // champ piège rempli par les robots : on ignore sans le dire

$cats = ['partie' => 'Partie introuvable', 'affichage' => "Problème d'affichage", 'bug' => 'Bug de jeu', 'autre' => 'Autre question'];
$cat = $cats[$in['category'] ?? ''] ?? 'Autre question';
$captain = sb_clean((string)($in['captain'] ?? ''), 60);
$email = sb_clean((string)($in['email'] ?? ''), 160);
$text = sb_clean((string)($in['message'] ?? ''), 4000);
$convo = sb_clean((string)($in['conversation'] ?? ''), 6000);
$device = sb_clean((string)($in['device'] ?? ''), 300);

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) sb_json(422, ['error' => 'email']);
if (mb_strlen($text) < 5) sb_json(422, ['error' => 'message']);

// Capture d'écran facultative (data URL), 3 Mo max, images seulement
$att = null;
if (!empty($in['image']) && preg_match('#^data:(image/(png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$#', (string)$in['image'], $m)) {
    $bin = base64_decode($m[3], true);
    if ($bin !== false && strlen($bin) <= 3 * 1024 * 1024 && @getimagesizefromstring($bin)) {
        $att = ['mime' => $m[1], 'ext' => $m[2] === 'jpeg' ? 'jpg' : $m[2], 'data' => $bin];
    }
}

$subject = '[Starbyte] ' . $cat . ($captain !== '' ? ' — ' . $captain : '');
$lines = [
    'Catégorie : ' . $cat,
    'Capitaine : ' . ($captain !== '' ? $captain : '(non indiqué)'),
    'Email : ' . $email,
    'Appareil : ' . ($device !== '' ? $device : '(inconnu)'),
    'Reçu le : ' . date('d.m.Y H:i'),
    '',
    $text,
];
if ($convo !== '') { $lines[] = ''; $lines[] = '--- Conversation avec l\'Assistance de bord ---'; $lines[] = $convo; }
$body = implode("\n", $lines);

$from = SB_SUPPORT_EMAIL;
$headers = [
    'From: Starbyte <' . $from . '>',
    'Reply-To: ' . $email,
    'MIME-Version: 1.0',
];
$enc = fn($s) => '=?UTF-8?B?' . base64_encode($s) . '?=';
if ($att) {
    $b = 'sb_' . bin2hex(random_bytes(8));
    $headers[] = 'Content-Type: multipart/mixed; boundary="' . $b . '"';
    $msg = "--$b\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($body))
         . "--$b\r\nContent-Type: {$att['mime']}; name=\"capture.{$att['ext']}\"\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename=\"capture.{$att['ext']}\"\r\n\r\n"
         . chunk_split(base64_encode($att['data'])) . "--$b--";
} else {
    $headers[] = 'Content-Type: text/plain; charset=UTF-8';
    $headers[] = 'Content-Transfer-Encoding: base64';
    $msg = chunk_split(base64_encode($body));
}

$cfg = sb_config();
if (!empty($cfg['smtp_pass_b64'])) {
    $res = sb_smtp_send($cfg, SB_SUPPORT_EMAIL, $enc($subject), $msg, $headers);
    if ($res !== true) { sb_log('contact smtp_failed ' . $res); sb_json(502, ['error' => 'send']); }
} elseif (function_exists('mail')) {
    if (!@mail(SB_SUPPORT_EMAIL, $enc($subject), $msg, implode("\r\n", $headers))) { sb_log('contact mail_failed'); sb_json(502, ['error' => 'send']); }
} else {
    sb_log('contact not_configured (ni SMTP ni mail())');
    sb_json(503, ['error' => 'send']);
}
sb_log('contact sent cat=' . $cat);
sb_json(200, ['ok' => true]);
