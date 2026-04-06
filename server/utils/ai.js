function trimToMaxLength(value, maxLength) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function extractAssistantText(ollamaPayload) {
  const content = ollamaPayload?.message?.content;
  return typeof content === 'string' ? content.trim() : '';
}

function detectRecommendedKit(aiReply = '') {
  const normalizedReply = aiReply.toLowerCase();

  if (normalizedReply.includes('bridge kit') || normalizedReply.includes('wireless bridge')) {
    return { name: 'Bridge Kit', recommendedCategory: 'bridge' };
  }
  if (normalizedReply.includes('ups') || normalizedReply.includes('battery backup') || normalizedReply.includes('power backup')) {
    return { name: 'Backup Kit', recommendedCategory: 'backup' };
  }
  if (
    normalizedReply.includes('camera') ||
    normalizedReply.includes('cctv') ||
    normalizedReply.includes('security kit')
  ) {
    return { name: 'Security Kit', recommendedCategory: 'security' };
  }
  if (
    normalizedReply.includes('cabinet') ||
    normalizedReply.includes('pole') ||
    normalizedReply.includes('junction box') ||
    normalizedReply.includes('infrastructure')
  ) {
    return { name: 'Infrastructure Kit', recommendedCategory: 'infrastructure' };
  }
  if (normalizedReply.includes('business network kit') || normalizedReply.includes('business kit')) {
    return { name: 'Business Network Kit', recommendedCategory: 'business' };
  }
  if (normalizedReply.includes('smart home') || normalizedReply.includes('smart device') || normalizedReply.includes('iot')) {
    return { name: 'Smart Kit', recommendedCategory: 'smart' };
  }
  if (normalizedReply.includes('home wifi kit') || normalizedReply.includes('home wi-fi kit')) {
    return { name: 'Home WiFi Kit', recommendedCategory: 'home' };
  }

  return null;
}

function detectNeedsTechnician(aiReply = '') {
  const normalizedReply = aiReply.toLowerCase();
  return (
    normalizedReply.includes('technician: yes') ||
    normalizedReply.includes('technician recommended') ||
    normalizedReply.includes('book a technician')
  );
}

module.exports = {
  trimToMaxLength,
  extractAssistantText,
  detectRecommendedKit,
  detectNeedsTechnician
};
