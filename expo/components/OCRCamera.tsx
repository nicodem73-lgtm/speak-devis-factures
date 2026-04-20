import { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Image,
  Alert,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, X, Check, RotateCcw, Sparkles } from 'lucide-react-native';
import { generateText } from '@rork-ai/toolkit-sdk';
import Colors from '@/constants/colors';

interface OCRCameraProps {
  visible: boolean;
  onClose: () => void;
  onTextExtracted: (text: string) => void;
  title?: string;
}

export default function OCRCamera({
  visible,
  onClose,
  onTextExtracted,
  title = 'Scanner avec IA',
}: OCRCameraProps) {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState<'capture' | 'preview' | 'result'>('capture');

  const resetState = useCallback(() => {
    setImageUri(null);
    setImageBase64(null);
    setExtractedText(null);
    setIsProcessing(false);
    setStep('capture');
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [resetState, onClose]);

  const requestCameraPermission = useCallback(async () => {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission requise',
          'Veuillez autoriser l\'accès à la caméra pour utiliser cette fonctionnalité.'
        );
        return false;
      }
    }
    return true;
  }, []);

  const takePhoto = useCallback(async () => {
    console.log('[OCRCamera] Taking photo...');
    
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        base64: true,
        allowsEditing: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        console.log('[OCRCamera] Photo captured:', asset.uri);
        setImageUri(asset.uri);
        setImageBase64(asset.base64 || null);
        setStep('preview');
      }
    } catch (error) {
      console.error('[OCRCamera] Error taking photo:', error);
      Alert.alert('Erreur', 'Impossible de prendre la photo');
    }
  }, [requestCameraPermission]);

  const pickFromGallery = useCallback(async () => {
    console.log('[OCRCamera] Picking from gallery...');
    
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        base64: true,
        allowsEditing: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        console.log('[OCRCamera] Image selected:', asset.uri);
        setImageUri(asset.uri);
        setImageBase64(asset.base64 || null);
        setStep('preview');
      }
    } catch (error) {
      console.error('[OCRCamera] Error picking image:', error);
      Alert.alert('Erreur', 'Impossible de sélectionner l\'image');
    }
  }, []);

  const processOCR = useCallback(async () => {
    if (!imageBase64) {
      Alert.alert('Erreur', 'Aucune image à analyser');
      return;
    }

    console.log('[OCRCamera] Processing OCR...');
    setIsProcessing(true);

    try {
      const text = await generateText({
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extrait tout le texte visible sur cette image. Retourne uniquement le texte extrait, sans commentaire ni explication. Si c\'est un ticket ou une facture, organise les informations de manière lisible.',
              },
              {
                type: 'image',
                image: `data:image/jpeg;base64,${imageBase64}`,
              },
            ],
          },
        ],
      });

      console.log('[OCRCamera] OCR result:', text);
      setExtractedText(text);
      setStep('result');
    } catch (error) {
      console.error('[OCRCamera] OCR error:', error);
      Alert.alert('Erreur', 'Impossible d\'extraire le texte de l\'image');
    } finally {
      setIsProcessing(false);
    }
  }, [imageBase64]);

  const handleConfirm = useCallback(() => {
    if (extractedText) {
      onTextExtracted(extractedText);
    }
    handleClose();
  }, [extractedText, onTextExtracted, handleClose]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <X size={24} color={Colors.light.text} />
          </TouchableOpacity>
          <Text style={styles.title}>{title}</Text>
          <View style={{ width: 32 }} />
        </View>

        <View style={styles.content}>
          {step === 'capture' && (
            <View style={styles.captureContainer}>
              <View style={styles.iconContainer}>
                <Camera size={48} color={Colors.light.tint} />
              </View>
              <Text style={styles.captureTitle}>Scanner un document</Text>
              <Text style={styles.captureDesc}>
                Prenez une photo ou sélectionnez une image pour extraire le texte automatiquement
              </Text>
              
              <View style={styles.captureButtons}>
                <TouchableOpacity
                  style={styles.captureButton}
                  onPress={takePhoto}
                >
                  <Camera size={22} color="#FFFFFF" />
                  <Text style={styles.captureButtonText}>Prendre une photo</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.galleryButton}
                  onPress={pickFromGallery}
                >
                  <Text style={styles.galleryButtonText}>Choisir dans la galerie</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {step === 'preview' && imageUri && (
            <View style={styles.previewContainer}>
              <View style={styles.previewImageContainer}>
                <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="contain" />
              </View>
              
              <View style={styles.previewActions}>
                <TouchableOpacity
                  style={styles.retakeButton}
                  onPress={resetState}
                >
                  <RotateCcw size={18} color={Colors.light.textSecondary} />
                  <Text style={styles.retakeButtonText}>Reprendre</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.processButton, isProcessing && styles.processButtonDisabled]}
                  onPress={processOCR}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <>
                      <ActivityIndicator size="small" color="#FFFFFF" />
                      <Text style={styles.processButtonText}>Analyse...</Text>
                    </>
                  ) : (
                    <>
                      <Sparkles size={18} color="#FFFFFF" />
                      <Text style={styles.processButtonText}>Extraire le texte</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {step === 'result' && (
            <View style={styles.resultContainer}>
              <View style={styles.resultHeader}>
                <Sparkles size={20} color={Colors.light.tint} />
                <Text style={styles.resultTitle}>Texte extrait</Text>
              </View>
              
              <View style={styles.resultTextContainer}>
                <Text style={styles.resultText}>{extractedText}</Text>
              </View>
              
              <View style={styles.resultActions}>
                <TouchableOpacity
                  style={styles.retakeButton}
                  onPress={resetState}
                >
                  <RotateCcw size={18} color={Colors.light.textSecondary} />
                  <Text style={styles.retakeButtonText}>Reprendre</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.confirmButton}
                  onPress={handleConfirm}
                >
                  <Check size={18} color="#FFFFFF" />
                  <Text style={styles.confirmButtonText}>Utiliser ce texte</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

interface PhotoThumbnailPickerProps {
  imageUri: string | null;
  onImageSelected: (uri: string) => void;
  onImageRemoved: () => void;
}

export function PhotoThumbnailPicker({
  imageUri,
  onImageSelected,
  onImageRemoved,
}: PhotoThumbnailPickerProps) {
  const [isLoading, setIsLoading] = useState(false);

  const pickImage = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.6,
        allowsEditing: true,
        aspect: [1, 1],
      });

      if (!result.canceled && result.assets[0]) {
        console.log('[PhotoThumbnail] Image selected:', result.assets[0].uri);
        onImageSelected(result.assets[0].uri);
      }
    } catch (error) {
      console.error('[PhotoThumbnail] Error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [onImageSelected]);

  const takePhoto = useCallback(async () => {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission requise', 'Veuillez autoriser l\'accès à la caméra.');
        return;
      }
    }

    setIsLoading(true);
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.6,
        allowsEditing: true,
        aspect: [1, 1],
      });

      if (!result.canceled && result.assets[0]) {
        console.log('[PhotoThumbnail] Photo taken:', result.assets[0].uri);
        onImageSelected(result.assets[0].uri);
      }
    } catch (error) {
      console.error('[PhotoThumbnail] Error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [onImageSelected]);

  const showOptions = useCallback(() => {
    if (imageUri) {
      Alert.alert(
        'Photo du produit',
        'Que souhaitez-vous faire ?',
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Supprimer', style: 'destructive', onPress: onImageRemoved },
          { text: 'Remplacer', onPress: () => pickImage() },
        ]
      );
    } else {
      Alert.alert(
        'Ajouter une photo',
        'Choisissez une source',
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Appareil photo', onPress: takePhoto },
          { text: 'Galerie', onPress: pickImage },
        ]
      );
    }
  }, [imageUri, onImageRemoved, pickImage, takePhoto]);

  if (isLoading) {
    return (
      <View style={thumbnailStyles.container}>
        <ActivityIndicator size="small" color={Colors.light.tint} />
      </View>
    );
  }

  if (imageUri) {
    return (
      <TouchableOpacity onPress={showOptions} style={thumbnailStyles.imageContainer}>
        <Image source={{ uri: imageUri }} style={thumbnailStyles.image} />
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity onPress={showOptions} style={thumbnailStyles.container}>
      <Camera size={16} color={Colors.light.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  closeButton: {
    padding: 4,
  },
  title: {
    fontSize: 17,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  captureContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.light.tint + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  captureTitle: {
    fontSize: 20,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  captureDesc: {
    fontSize: 15,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: 22,
  },
  captureButtons: {
    width: '100%',
    gap: 12,
    marginTop: 24,
  },
  captureButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.tint,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 10,
  },
  captureButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#FFFFFF',
  },
  galleryButton: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  galleryButtonText: {
    fontSize: 15,
    fontWeight: '500' as const,
    color: Colors.light.tint,
  },
  previewContainer: {
    flex: 1,
    gap: 16,
  },
  previewImageContainer: {
    flex: 1,
    position: 'relative',
  },
  previewImage: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: Colors.light.surface,
  },
  previewActions: {
    flexDirection: 'row',
    gap: 12,
  },
  retakeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.surface,
    paddingVertical: 14,
    borderRadius: 10,
    gap: 8,
  },
  retakeButtonText: {
    fontSize: 15,
    fontWeight: '500' as const,
    color: Colors.light.textSecondary,
  },
  processButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.tint,
    paddingVertical: 14,
    borderRadius: 10,
    gap: 8,
  },
  processButtonDisabled: {
    opacity: 0.7,
  },
  processButtonText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#FFFFFF',
  },
  resultContainer: {
    flex: 1,
    gap: 16,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  resultTitle: {
    fontSize: 17,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  resultTextContainer: {
    flex: 1,
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 16,
  },
  resultText: {
    fontSize: 15,
    color: Colors.light.text,
    lineHeight: 22,
  },
  resultActions: {
    flexDirection: 'row',
    gap: 12,
  },
  confirmButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#34C759',
    paddingVertical: 14,
    borderRadius: 10,
    gap: 8,
  },
  confirmButtonText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#FFFFFF',
  },
});

const thumbnailStyles = StyleSheet.create({
  container: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: Colors.light.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderStyle: 'dashed',
  },
  imageContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
