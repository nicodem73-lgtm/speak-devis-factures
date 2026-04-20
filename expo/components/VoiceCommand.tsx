import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Animated,
  Platform,
} from 'react-native';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import {
  Mic,
  MicOff,
  X,
  Check,
  Edit3,
  AlertCircle,
  MessageSquare,
  Command,
  UserPlus,
  FilePlus,
  Receipt,
  PlusCircle,
  FileOutput,
  CheckCircle,
  Send,
  Search,
  HelpCircle,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { VoiceMode, ActionDraft, VoiceIntent, INTENT_LABELS, ExtractedField } from '@/types/voice';
import { parseVoiceCommand, parseDictation } from '@/utils/nlu';

export const VOICE_ERROR_CODES = {
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  RECORDING_FAILED: 'RECORDING_FAILED',
  PROCESSING_FAILED: 'PROCESSING_FAILED',
  NO_SPEECH_DETECTED: 'NO_SPEECH_DETECTED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  UNSUPPORTED_BROWSER: 'UNSUPPORTED_BROWSER',
} as const;

export const VOICE_ERROR_MESSAGES: Record<string, { title: string; message: string; retry: boolean }> = {
  [VOICE_ERROR_CODES.PERMISSION_DENIED]: {
    title: 'Microphone non autorisé',
    message: 'Autorisez l\'accès au microphone dans les paramètres de votre appareil pour utiliser les commandes vocales.',
    retry: false,
  },
  [VOICE_ERROR_CODES.RECORDING_FAILED]: {
    title: 'Erreur d\'enregistrement',
    message: 'Impossible de démarrer l\'enregistrement. Vérifiez que le microphone fonctionne correctement.',
    retry: true,
  },
  [VOICE_ERROR_CODES.PROCESSING_FAILED]: {
    title: 'Erreur de traitement',
    message: 'Impossible de traiter l\'audio. Veuillez réessayer.',
    retry: true,
  },
  [VOICE_ERROR_CODES.NO_SPEECH_DETECTED]: {
    title: 'Aucune parole détectée',
    message: 'Nous n\'avons pas détecté de parole. Parlez clairement près du microphone.',
    retry: true,
  },
  [VOICE_ERROR_CODES.NETWORK_ERROR]: {
    title: 'Erreur réseau',
    message: 'Vérifiez votre connexion internet et réessayez.',
    retry: true,
  },
  [VOICE_ERROR_CODES.UNSUPPORTED_BROWSER]: {
    title: 'Navigateur non supporté',
    message: 'Votre navigateur ne supporte pas l\'enregistrement audio. Essayez avec Chrome ou Safari.',
    retry: false,
  },
};

interface VoiceError {
  code: string;
  title: string;
  message: string;
  canRetry: boolean;
}

const STT_URL = 'https://toolkit.rork.com/stt/transcribe/';

interface VoiceCommandProps {
  visible: boolean;
  onClose: () => void;
  onAction: (action: ActionDraft) => void;
  initialMode?: VoiceMode;
  targetField?: string;
}

const INTENT_ICON_MAP: Record<VoiceIntent, React.ReactNode> = {
  CREATE_CLIENT: <UserPlus size={24} color={Colors.light.tint} />,
  CREATE_QUOTE: <FilePlus size={24} color={Colors.light.info} />,
  CREATE_INVOICE: <Receipt size={24} color={Colors.light.success} />,
  ADD_LINE: <PlusCircle size={24} color={Colors.light.warning} />,
  SET_FIELD: <Edit3 size={24} color={Colors.light.textSecondary} />,
  CONVERT_TO_INVOICE: <FileOutput size={24} color={Colors.light.info} />,
  MARK_PAID: <CheckCircle size={24} color={Colors.light.success} />,
  MARK_SENT: <Send size={24} color={Colors.light.tint} />,
  SEARCH: <Search size={24} color={Colors.light.textSecondary} />,
  UNKNOWN: <HelpCircle size={24} color={Colors.light.error} />,
};

export default function VoiceCommand({
  visible,
  onClose,
  onAction,
  initialMode = 'command',
  targetField,
}: VoiceCommandProps) {
  const [mode, setMode] = useState<VoiceMode>(initialMode);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [actionDraft, setActionDraft] = useState<ActionDraft | null>(null);
  const [error, setError] = useState<VoiceError | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editedFields, setEditedFields] = useState<Record<string, string | number | boolean>>({});

  const recordingRef = useRef<Audio.Recording | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const setVoiceError = useCallback((code: string) => {
    const errorInfo = VOICE_ERROR_MESSAGES[code];
    if (errorInfo) {
      setError({
        code,
        title: errorInfo.title,
        message: errorInfo.message,
        canRetry: errorInfo.retry,
      });
    } else {
      setError({
        code: 'UNKNOWN',
        title: 'Erreur',
        message: 'Une erreur inattendue est survenue.',
        canRetry: true,
      });
    }
  }, []);

  useEffect(() => {
    if (visible) {
      setMode(initialMode);
      setTranscription('');
      setActionDraft(null);
      setError(null);
      setEditingField(null);
      setEditedFields({});
    }
  }, [visible, initialMode]);

  useEffect(() => {
    let animation: Animated.CompositeAnimation;
    if (isRecording) {
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
    } else {
      pulseAnim.setValue(1);
    }
    return () => {
      if (animation) animation.stop();
    };
  }, [isRecording, pulseAnim]);

  const startRecordingNative = useCallback(async () => {
    try {
      // Clean up any existing recording first
      if (recordingRef.current) {
        console.log('[Voice] Cleaning up previous recording...');
        try {
          await recordingRef.current.stopAndUnloadAsync();
        } catch (e) {
          console.log('[Voice] Previous recording cleanup error (ignored):', e);
        }
        recordingRef.current = null;
      }

      console.log('[Voice] Requesting permissions...');
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        console.log('[Voice] Permission denied');
        setVoiceError(VOICE_ERROR_CODES.PERMISSION_DENIED);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      console.log('[Voice] Starting recording...');
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setIsRecording(true);
      setError(null);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (err) {
      console.error('[Voice] Error starting recording:', err);
      setVoiceError(VOICE_ERROR_CODES.RECORDING_FAILED);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [setVoiceError]);

  const startRecordingWeb = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.log('[Voice] MediaDevices not supported');
        setVoiceError(VOICE_ERROR_CODES.UNSUPPORTED_BROWSER);
        return;
      }

      console.log('[Voice] Requesting web audio permissions...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioChunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
      setError(null);
      console.log('[Voice] Web recording started');
    } catch (err: any) {
      console.error('[Voice] Error starting web recording:', err);
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        setVoiceError(VOICE_ERROR_CODES.PERMISSION_DENIED);
      } else if (err?.name === 'NotFoundError') {
        setVoiceError(VOICE_ERROR_CODES.RECORDING_FAILED);
      } else {
        setVoiceError(VOICE_ERROR_CODES.RECORDING_FAILED);
      }
    }
  }, [setVoiceError]);

  const startRecording = useCallback(async () => {
    if (Platform.OS === 'web') {
      await startRecordingWeb();
    } else {
      await startRecordingNative();
    }
  }, [startRecordingNative, startRecordingWeb]);

  const stopRecordingNative = useCallback(async () => {
    if (!recordingRef.current) return null;

    console.log('[Voice] Stopping native recording...');
    setIsRecording(false);
    setIsProcessing(true);

    try {
      await recordingRef.current.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });

      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (!uri) {
        throw new Error('No recording URI');
      }

      const uriParts = uri.split('.');
      const fileType = uriParts[uriParts.length - 1];

      const formData = new FormData();
      formData.append('audio', {
        uri,
        name: `recording.${fileType}`,
        type: `audio/${fileType}`,
      } as unknown as Blob);
      formData.append('language', 'fr');

      console.log('[Voice] Sending to STT API...');
      const response = await fetch(STT_URL, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`STT API error: ${response.status}`);
      }

      const result = await response.json();
      console.log('[Voice] STT result:', result);

      return result.text;
    } catch (err) {
      console.error('[Voice] Error processing recording:', err);
      throw err;
    }
  }, []);

  const stopRecordingWeb = useCallback(async (): Promise<string | null> => {
    return new Promise((resolve, reject) => {
      if (!mediaRecorderRef.current) {
        resolve(null);
        return;
      }

      console.log('[Voice] Stopping web recording...');
      setIsRecording(false);
      setIsProcessing(true);

      const mediaRecorder = mediaRecorderRef.current;

      mediaRecorder.onstop = async () => {
        try {
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
          }

          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          audioChunksRef.current = [];

          const formData = new FormData();
          formData.append('audio', audioBlob, 'recording.webm');
          formData.append('language', 'fr');

          console.log('[Voice] Sending web audio to STT API...');
          const response = await fetch(STT_URL, {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            throw new Error(`STT API error: ${response.status}`);
          }

          const result = await response.json();
          console.log('[Voice] STT result:', result);
          resolve(result.text);
        } catch (err) {
          console.error('[Voice] Error processing web recording:', err);
          reject(err);
        }
      };

      mediaRecorder.stop();
      mediaRecorderRef.current = null;
    });
  }, []);

  const stopRecording = useCallback(async () => {
    try {
      let text: string | null = null;
      
      if (Platform.OS === 'web') {
        text = await stopRecordingWeb();
      } else {
        text = await stopRecordingNative();
      }

      if (!text || text.trim().length === 0) {
        setVoiceError(VOICE_ERROR_CODES.NO_SPEECH_DETECTED);
        setIsProcessing(false);
        return;
      }

      setTranscription(text);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (mode === 'command') {
        const draft = parseVoiceCommand(text);
        setActionDraft(draft);
        const initialEdits: Record<string, string | number | boolean> = {};
        draft.extractedFields.forEach(f => {
          initialEdits[f.key] = f.value;
        });
        setEditedFields(initialEdits);
      } else {
        const draft = parseDictation(text, targetField);
        setActionDraft(draft);
        setEditedFields({ [targetField || 'text']: draft.extractedFields[0]?.value || text });
      }
    } catch (err: any) {
      console.error('[Voice] Error:', err);
      if (err?.message?.includes('network') || err?.message?.includes('fetch')) {
        setVoiceError(VOICE_ERROR_CODES.NETWORK_ERROR);
      } else {
        setVoiceError(VOICE_ERROR_CODES.PROCESSING_FAILED);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsProcessing(false);
    }
  }, [mode, targetField, stopRecordingNative, stopRecordingWeb, setVoiceError]);

  const handleConfirm = useCallback(() => {
    if (!actionDraft) return;

    const updatedFields = actionDraft.extractedFields.map(field => ({
      ...field,
      value: editedFields[field.key] ?? field.value,
    }));

    const finalAction: ActionDraft = {
      ...actionDraft,
      extractedFields: updatedFields,
    };

    console.log('[Voice] Confirming action:', finalAction);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onAction(finalAction);
    onClose();
  }, [actionDraft, editedFields, onAction, onClose]);

  const handleCancel = useCallback(() => {
    setTranscription('');
    setActionDraft(null);
    setError(null);
    setEditedFields({});
  }, []);

  const handleClose = useCallback(() => {
    if (isRecording) {
      if (Platform.OS === 'web' && mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
      } else if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync();
      }
    }
    setIsRecording(false);
    setIsProcessing(false);
    onClose();
  }, [isRecording, onClose]);

  const handleFieldChange = useCallback((key: string, value: string) => {
    setEditedFields(prev => ({ ...prev, [key]: value }));
  }, []);

  const renderFieldEditor = useCallback((field: ExtractedField) => {
    const isEditing = editingField === field.key;
    const currentValue = editedFields[field.key] ?? field.value;

    return (
      <View key={field.key} style={styles.fieldRow}>
        <Text style={styles.fieldLabel}>{field.label}</Text>
        {isEditing ? (
          <View style={styles.fieldEditContainer}>
            <TextInput
              style={styles.fieldInput}
              value={String(currentValue)}
              onChangeText={(val) => handleFieldChange(field.key, val)}
              autoFocus
              onBlur={() => setEditingField(null)}
              returnKeyType="done"
              onSubmitEditing={() => setEditingField(null)}
            />
          </View>
        ) : (
          <TouchableOpacity
            style={styles.fieldValueContainer}
            onPress={() => field.editable && setEditingField(field.key)}
            disabled={!field.editable}
          >
            <Text style={styles.fieldValue} numberOfLines={1}>
              {String(currentValue)}
            </Text>
            {field.editable && (
              <Edit3 size={14} color={Colors.light.textMuted} />
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  }, [editingField, editedFields, handleFieldChange]);

  const getConfidenceColor = useCallback((confidence: number): string => {
    if (confidence >= 0.7) return Colors.light.success;
    if (confidence >= 0.4) return Colors.light.warning;
    return Colors.light.error;
  }, []);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable style={styles.container} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <View style={styles.modeToggle}>
              <TouchableOpacity
                style={[styles.modeButton, mode === 'command' && styles.modeButtonActive]}
                onPress={() => setMode('command')}
                disabled={isRecording || isProcessing}
              >
                <Command size={16} color={mode === 'command' ? '#FFFFFF' : Colors.light.textSecondary} />
                <Text style={[styles.modeText, mode === 'command' && styles.modeTextActive]}>
                  Commande
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeButton, mode === 'dictation' && styles.modeButtonActive]}
                onPress={() => setMode('dictation')}
                disabled={isRecording || isProcessing}
              >
                <MessageSquare size={16} color={mode === 'dictation' ? '#FFFFFF' : Colors.light.textSecondary} />
                <Text style={[styles.modeText, mode === 'dictation' && styles.modeTextActive]}>
                  Dictée
                </Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
              <X size={24} color={Colors.light.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {!actionDraft && !isProcessing && (
              <View style={styles.instructionContainer}>
                <Text style={styles.instructionTitle}>
                  {mode === 'command' ? 'Mode Commande' : 'Mode Dictée'}
                </Text>
                <Text style={styles.instructionText}>
                  {mode === 'command'
                    ? 'Dites une commande comme "Créer un devis pour Dupont" ou "Marquer comme payé"'
                    : 'Dictez le texte à insérer dans le champ sélectionné'}
                </Text>
                {mode === 'command' && (
                  <View style={styles.examplesContainer}>
                    <Text style={styles.examplesTitle}>Exemples :</Text>
                    <Text style={styles.exampleText}>• Nouveau client Jean Dupont</Text>
                    <Text style={styles.exampleText}>• Créer une facture pour Société ABC</Text>
                    <Text style={styles.exampleText}>• Ajouter 3 heures de consultation à 80 euros</Text>
                    <Text style={styles.exampleText}>• Marquer comme payé par virement</Text>
                    <Text style={styles.exampleText}>• Rechercher facture Dupont</Text>
                  </View>
                )}
              </View>
            )}

            {isProcessing && (
              <View style={styles.processingContainer}>
                <ActivityIndicator size="large" color={Colors.light.tint} />
                <Text style={styles.processingText}>Analyse en cours...</Text>
              </View>
            )}

            {error && (
              <View style={styles.errorContainer}>
                <View style={styles.errorIconContainer}>
                  <AlertCircle size={32} color={Colors.light.error} />
                </View>
                <Text style={styles.errorTitle}>{error.title}</Text>
                <Text style={styles.errorText}>{error.message}</Text>
                {error.canRetry && (
                  <TouchableOpacity style={styles.retryButton} onPress={handleCancel}>
                    <Text style={styles.retryText}>Réessayer</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {actionDraft && !isProcessing && (
              <View style={styles.resultContainer}>
                <View style={styles.transcriptionCard}>
                  <Text style={styles.transcriptionLabel}>Transcription</Text>
                  <Text style={styles.transcriptionText}>{`"${transcription}"`}</Text>
                </View>

                <View style={styles.actionCard}>
                  <View style={styles.actionHeader}>
                    <View style={styles.intentIcon}>
                      {INTENT_ICON_MAP[actionDraft.intent]}
                    </View>
                    <View style={styles.actionInfo}>
                      <Text style={styles.actionTitle}>{INTENT_LABELS[actionDraft.intent]}</Text>
                      <Text style={styles.actionSuggested}>{actionDraft.suggestedAction}</Text>
                    </View>
                    <View style={[styles.confidenceBadge, { backgroundColor: getConfidenceColor(actionDraft.confidence) + '20' }]}>
                      <Text style={[styles.confidenceText, { color: getConfidenceColor(actionDraft.confidence) }]}>
                        {Math.round(actionDraft.confidence * 100)}%
                      </Text>
                    </View>
                  </View>

                  {actionDraft.extractedFields.length > 0 && (
                    <View style={styles.fieldsContainer}>
                      <Text style={styles.fieldsTitle}>Données extraites</Text>
                      {actionDraft.extractedFields.map(renderFieldEditor)}
                    </View>
                  )}
                </View>

                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={handleCancel}
                  >
                    <X size={20} color={Colors.light.error} />
                    <Text style={styles.cancelButtonText}>Annuler</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.confirmButton,
                      actionDraft.intent === 'UNKNOWN' && styles.confirmButtonDisabled,
                    ]}
                    onPress={handleConfirm}
                    disabled={actionDraft.intent === 'UNKNOWN'}
                  >
                    <Check size={20} color="#FFFFFF" />
                    <Text style={styles.confirmButtonText}>Confirmer</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>

          <View style={styles.recordingSection}>
            <TouchableOpacity
              style={[styles.recordButton, isRecording && styles.recordButtonActive]}
              onPressIn={startRecording}
              onPressOut={stopRecording}
              disabled={isProcessing}
            >
              <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                {isRecording ? (
                  <MicOff size={32} color="#FFFFFF" />
                ) : (
                  <Mic size={32} color={isProcessing ? Colors.light.textMuted : Colors.light.tint} />
                )}
              </Animated.View>
            </TouchableOpacity>
            <Text style={styles.recordHint}>
              {isRecording
                ? 'Relâchez pour arrêter'
                : isProcessing
                ? 'Traitement...'
                : 'Maintenez pour parler'}
            </Text>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: Colors.light.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    minHeight: 400,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.light.background,
    borderRadius: 10,
    padding: 4,
  },
  modeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  modeButtonActive: {
    backgroundColor: Colors.light.tint,
  },
  modeText: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: Colors.light.textSecondary,
  },
  modeTextActive: {
    color: '#FFFFFF',
  },
  closeButton: {
    padding: 8,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  instructionContainer: {
    alignItems: 'center',
    padding: 20,
  },
  instructionTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.light.text,
    marginBottom: 8,
  },
  instructionText: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  examplesContainer: {
    marginTop: 20,
    alignSelf: 'stretch',
    backgroundColor: Colors.light.background,
    borderRadius: 12,
    padding: 16,
  },
  examplesTitle: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.light.textSecondary,
    marginBottom: 8,
  },
  exampleText: {
    fontSize: 13,
    color: Colors.light.textMuted,
    marginBottom: 4,
  },
  processingContainer: {
    alignItems: 'center',
    padding: 40,
    gap: 16,
  },
  processingText: {
    fontSize: 15,
    color: Colors.light.textSecondary,
  },
  errorContainer: {
    alignItems: 'center',
    padding: 24,
    gap: 12,
    backgroundColor: Colors.light.error + '08',
    borderRadius: 16,
    marginHorizontal: 8,
  },
  errorIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.light.error + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.light.text,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: Colors.light.background,
    borderRadius: 8,
  },
  retryText: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.light.tint,
  },
  resultContainer: {
    gap: 16,
  },
  transcriptionCard: {
    backgroundColor: Colors.light.background,
    borderRadius: 12,
    padding: 16,
  },
  transcriptionLabel: {
    fontSize: 12,
    fontWeight: '500' as const,
    color: Colors.light.textMuted,
    marginBottom: 8,
  },
  transcriptionText: {
    fontSize: 15,
    color: Colors.light.text,
    fontStyle: 'italic' as const,
  },
  actionCard: {
    backgroundColor: Colors.light.background,
    borderRadius: 12,
    padding: 16,
    gap: 16,
  },
  actionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  intentIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.light.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionInfo: {
    flex: 1,
    gap: 2,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  actionSuggested: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  confidenceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  confidenceText: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  fieldsContainer: {
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
    paddingTop: 16,
    gap: 12,
  },
  fieldsTitle: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.light.textSecondary,
    marginBottom: 4,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldLabel: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    flex: 1,
  },
  fieldValueContainer: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: Colors.light.surface,
    borderRadius: 8,
  },
  fieldValue: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.light.text,
    flex: 1,
    textAlign: 'right',
  },
  fieldEditContainer: {
    flex: 2,
  },
  fieldInput: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.light.text,
    backgroundColor: Colors.light.surface,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 2,
    borderColor: Colors.light.tint,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: Colors.light.error + '15',
    borderRadius: 12,
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.light.error,
  },
  confirmButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: Colors.light.tint,
    borderRadius: 12,
  },
  confirmButtonDisabled: {
    backgroundColor: Colors.light.textMuted,
    opacity: 0.5,
  },
  confirmButtonText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#FFFFFF',
  },
  recordingSection: {
    alignItems: 'center',
    padding: 20,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
  },
  recordButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.light.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.light.tint,
    marginBottom: 12,
  },
  recordButtonActive: {
    backgroundColor: Colors.light.error,
    borderColor: Colors.light.error,
  },
  recordHint: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
});
