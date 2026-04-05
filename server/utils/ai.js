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
    return { name: 'Bridge Kit', type: 'bridge' };
  }
  if (normalizedReply.includes('business network kit') || normalizedReply.includes('business kit')) {
    return { name: 'Business Network Kit', type: 'business' };
  }
  if (normalizedReply.includes('home wifi kit') || normalizedReply.includes('home wi-fi kit')) {
    return { name: 'Home WiFi Kit', type: 'home' };
  }
  if (normalizedReply.includes('cctv')) {
    return { name: 'CCTV Kit', type: 'cctv' };
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
