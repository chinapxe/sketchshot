export const MAX_CHARACTER_IDENTITY_STRENGTH = 1

export function hasCharacterReferenceImages(referenceImages: string[] | undefined): boolean {
  return (referenceImages ?? []).some((item) => typeof item === 'string' && item.trim().length > 0)
}

function inferPromptLanguage(value: string): 'zh' | 'en' {
  return /[\u4e00-\u9fff]/.test(value) ? 'zh' : 'en'
}

export function buildCharacterConsistencyRequirement(referenceImages: string[] | undefined): string | null {
  if (!hasCharacterReferenceImages(referenceImages)) {
    return null
  }

  return 'Maintain exact character identity from the reference images with maximum consistency.'
}

export function appendCharacterConsistencyPrompt(prompt: string, referenceImages: string[] | undefined): string {
  const trimmedPrompt = prompt.trim()
  if (!hasCharacterReferenceImages(referenceImages)) {
    return trimmedPrompt
  }

  const requirement = inferPromptLanguage(trimmedPrompt) === 'en'
    ? 'Character consistency requirement: strictly preserve the same person from the reference images. Keep facial features, hairstyle, costume, and identity unchanged.'
    : '角色一致性要求：严格保持参考图中同一角色的人脸特征、发型、服装和身份特征不变，不要换人，不要改脸，不要改造型。'

  return trimmedPrompt ? `${trimmedPrompt}\n${requirement}` : requirement
}
